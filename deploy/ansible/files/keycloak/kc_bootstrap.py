#!/usr/bin/env python3
"""Idempotent Keycloak setup for one MDS environment (stdlib only).

Run by roles/keycloak/tasks/realm.yml. Reads its configuration as JSON from the
KC_BOOTSTRAP_CONFIG environment variable (secrets stay out of argv):

{
  "url": "http://10.43.x.x:8080",             # Keycloak base URL reachable from here
  "admin_user": "...", "admin_password": "...",
  "realm": "mds-develop",
  "display_name": "MDS develop",
  "frontend_url": "https://keycloak-staging.oanstaging.com",  # optional, per-realm public URL
  "realm_settings": {...},                       # merged into the realm representation
  "client": {"client_id": "master-data", "secret": "...", "ui_url": "https://mds-dev..."},
  "roles": {"MASTER_DATA_ADMIN": "description", ...},
  "users": [{"username": "...", "password": "...", "email": "...",
             "first_name": "...", "last_name": "...", "roles": ["..."]}]
}

Creates what is missing and corrects drift in realm settings, the client, roles
and role mappings. A user's password is only set when the user is created, so
passwords changed later in the Keycloak console are kept. Prints a JSON result
({"changed": bool, "actions": [...]}) for Ansible.
"""

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

CFG = json.loads(os.environ["KC_BOOTSTRAP_CONFIG"])
BASE = CFG["url"].rstrip("/")
REALM = CFG["realm"]
ACTIONS = []


def call(method, path, body=None, token=None, form=None, ok=(200, 201, 204)):
    headers = {"Accept": "application/json"}
    data = None
    if form is not None:
        data = urllib.parse.urlencode(form).encode()
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    elif body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(BASE + path, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            raw = res.read()
            return res.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as err:
        if err.code in ok:
            return err.code, None
        detail = err.read().decode(errors="replace")[:500]
        raise SystemExit(json.dumps({"failed": True, "msg": f"{method} {path} -> {err.code}: {detail}"}))


def admin_token():
    _, res = call(
        "POST",
        "/realms/master/protocol/openid-connect/token",
        form={
            "grant_type": "password",
            "client_id": "admin-cli",
            "username": CFG["admin_user"],
            "password": CFG["admin_password"],
        },
    )
    return res["access_token"]


def drifted(current, wanted):
    """True when any wanted key differs from the current representation."""
    for key, value in wanted.items():
        if isinstance(value, dict):
            if drifted(current.get(key) or {}, value):
                return True
        elif current.get(key) != value:
            return True
    return False


def ensure_realm(tok):
    wanted = {
        "realm": REALM,
        "enabled": True,
        "displayName": CFG.get("display_name", REALM),
        **CFG.get("realm_settings", {}),
    }
    if CFG.get("frontend_url"):
        wanted["attributes"] = {"frontendUrl": CFG["frontend_url"]}
    status, current = call("GET", f"/admin/realms/{REALM}", token=tok, ok=(404,))
    if status == 404:
        call("POST", "/admin/realms", wanted, tok)
        ACTIONS.append(f"created realm {REALM}")
    elif drifted(current, wanted):
        call("PUT", f"/admin/realms/{REALM}", wanted, tok)
        ACTIONS.append(f"updated realm {REALM} settings")


def ensure_client(tok):
    c = CFG["client"]
    ui = c["ui_url"].rstrip("/")
    wanted = {
        "clientId": c["client_id"],
        "name": c.get("name", "Master Data Service"),
        "enabled": True,
        "protocol": "openid-connect",
        "publicClient": False,
        "clientAuthenticatorType": "client-secret",
        "secret": c["secret"],
        "standardFlowEnabled": True,
        "directAccessGrantsEnabled": False,
        "implicitFlowEnabled": False,
        "serviceAccountsEnabled": False,
        "fullScopeAllowed": True,
        "rootUrl": ui,
        "baseUrl": "/",
        "redirectUris": [f"{ui}/mock-iam/oidc/callback"],
        "webOrigins": [ui],
        "attributes": {
            "pkce.code.challenge.method": "S256",
            "post.logout.redirect.uris": f"{ui}/*",
        },
    }
    _, found = call("GET", f"/admin/realms/{REALM}/clients?clientId={urllib.parse.quote(c['client_id'])}", token=tok)
    if not found:
        call("POST", f"/admin/realms/{REALM}/clients", wanted, tok)
        ACTIONS.append(f"created client {c['client_id']}")
        _, found = call("GET", f"/admin/realms/{REALM}/clients?clientId={urllib.parse.quote(c['client_id'])}", token=tok)
    client = found[0]
    _, secret = call("GET", f"/admin/realms/{REALM}/clients/{client['id']}/client-secret", token=tok)
    current = dict(client, secret=(secret or {}).get("value"))
    if drifted(current, wanted):
        call("PUT", f"/admin/realms/{REALM}/clients/{client['id']}", dict(client, **wanted), tok)
        ACTIONS.append(f"updated client {c['client_id']}")
    return client["id"]


def ensure_roles(tok, cid):
    roles = {}
    for name, description in CFG["roles"].items():
        path = f"/admin/realms/{REALM}/clients/{cid}/roles"
        status, role = call("GET", f"{path}/{urllib.parse.quote(name)}", token=tok, ok=(404,))
        if status == 404:
            call("POST", path, {"name": name, "description": description}, tok)
            ACTIONS.append(f"created role {name}")
            _, role = call("GET", f"{path}/{urllib.parse.quote(name)}", token=tok)
        elif role.get("description") != description:
            call("PUT", f"{path}/{urllib.parse.quote(name)}", dict(role, description=description), tok)
            ACTIONS.append(f"updated role {name}")
        roles[name] = role
    return roles


def ensure_users(tok, cid, roles):
    for u in CFG["users"]:
        name = u["username"]
        _, found = call("GET", f"/admin/realms/{REALM}/users?exact=true&username={urllib.parse.quote(name)}", token=tok)
        wanted = {
            "username": name,
            "enabled": True,
            "email": u.get("email"),
            "emailVerified": True,
            "firstName": u.get("first_name"),
            "lastName": u.get("last_name"),
        }
        if not found:
            wanted["credentials"] = [{"type": "password", "value": u["password"], "temporary": False}]
            call("POST", f"/admin/realms/{REALM}/users", wanted, tok)
            ACTIONS.append(f"created user {name}")
            _, found = call("GET", f"/admin/realms/{REALM}/users?exact=true&username={urllib.parse.quote(name)}", token=tok)
        elif drifted(found[0], wanted):
            call("PUT", f"/admin/realms/{REALM}/users/{found[0]['id']}", wanted, tok)
            ACTIONS.append(f"updated user {name}")
        uid = found[0]["id"]

        mapping = f"/admin/realms/{REALM}/users/{uid}/role-mappings/clients/{cid}"
        _, current = call("GET", mapping, token=tok)
        have = {r["name"] for r in current or []}
        want = set(u.get("roles", []))
        if want - have:
            call("POST", mapping, [roles[r] for r in sorted(want - have)], tok)
            ACTIONS.append(f"granted {sorted(want - have)} to {name}")
        # Only roles this script manages are removed; others granted in the console stay.
        extra = (have - want) & set(roles)
        if extra:
            call("DELETE", mapping, [roles[r] for r in sorted(extra)], tok)
            ACTIONS.append(f"revoked {sorted(extra)} from {name}")


def main():
    tok = admin_token()
    ensure_realm(tok)
    cid = ensure_client(tok)
    roles = ensure_roles(tok, cid)
    ensure_users(tok, cid, roles)
    print(json.dumps({"changed": bool(ACTIONS), "actions": ACTIONS}))


if __name__ == "__main__":
    sys.exit(main())
