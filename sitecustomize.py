"""Auth hooks for the official openg2p/master-data-api image.

Python imports ``sitecustomize`` automatically at start-up when its folder is on
PYTHONPATH. The API pod mounts this file at /opt/mds-hooks and sets
PYTHONPATH=/opt/mds-hooks, so the image and its start command stay untouched
and the built-in DB migration still runs.

iam-core always validates a Keycloak JWT and resolves permissions through the
IAM staff-portal API, whatever MASTER_DATA_API_AUTH_ENABLED says. There is no
staff-portal here, so these hooks replace both steps. MDS_AUTH_MODE picks how:

``keycloak``
    The access token must be a Keycloak JWT for MDS_KEYCLOAK_CLIENT_ID (azp),
    signed by a key from MDS_KEYCLOAK_JWKS_URL and issued by
    MDS_KEYCLOAK_ISSUER. The principal is the real user (``sub``), so the API's
    own maker != checker rule applies between people. The client roles in the
    token (resource_access[<client>].roles) become permissions through
    MDS_ROLE_PERMISSIONS (JSON: role -> [permission, ...]).

``standalone`` (default)
    Every request that needs auth gets a fixed admin principal holding every
    master-data permission. Approve and reject calls run as a second identity
    (the "checker"), so the draft -> submit -> approve flow works from the
    single login. When MDS_LOGIN_PASSWORD is set, a request only gets the admin
    principal if it carries the session token the mock IAM issues after a
    correct username and password (same derivation as mock_iam.js); anything
    else is 401.
"""

import hashlib
import hmac
import json
import os
import sys

# Propagate MASTER_DATA_API_DB_* to COMMON_DB_* so openg2p_fastapi_common uses the correct DB host
for k, v in list(os.environ.items()):
    if k.startswith("MASTER_DATA_API_DB_"):
        common_k = "COMMON_" + k[len("MASTER_DATA_API_"):]
        os.environ.setdefault(common_k, v)

_ALL_PERMISSIONS = {
    "referenceData:create",
    "referenceData:edit",
    "referenceData:delete",
    "referenceData:publish",
    "geo:create",
    "geo:edit",
    "geo:delete",
    "geo:publish",
}


def _session_token():
    password = os.environ.get("MDS_LOGIN_PASSWORD", "")
    if not password:
        return None
    user = os.environ.get("MDS_LOGIN_USERNAME", "admin")
    return hashlib.sha256(f"mds-standalone-session:{user}:{password}".encode()).hexdigest()


def _role_permissions():
    raw = os.environ.get("MDS_ROLE_PERMISSIONS", "")
    if not raw:
        return {"MASTER_DATA_ADMIN": set(_ALL_PERMISSIONS)}
    return {role: set(perms or []) for role, perms in json.loads(raw).items()}


def _install_keycloak():
    import asyncio

    import jwt
    from iam_core.schemas import AuthPrincipal
    from iam_core.schemas.logged_in_user import LoggedInUserResponse
    from iam_core.user_auth.helpers.token_helper import access_token_and_id_token_from_request
    from iam_core.user_auth.middleware import resolve_permissions, validate_and_refresh
    from openg2p_fastapi_common.errors.http_exceptions import UnauthorizedError

    issuer = os.environ["MDS_KEYCLOAK_ISSUER"].rstrip("/")
    jwks_url = os.environ["MDS_KEYCLOAK_JWKS_URL"]
    client_id = os.environ.get("MDS_KEYCLOAK_CLIENT_ID", "master-data")
    # iam-core reads the user's roles from client_roles[<its keycloak_client_id>].
    roles_key = os.environ.get("MASTER_DATA_API_KEYCLOAK_CLIENT_ID", client_id)
    role_permissions = _role_permissions()
    jwks = jwt.PyJWKClient(jwks_url, cache_keys=True, lifespan=600, timeout=10)

    def _verify(token):
        key = jwks.get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            key.key,
            algorithms=["RS256"],
            issuer=issuer,
            options={"verify_aud": False, "require": ["exp", "iat", "sub"]},
            leeway=30,
        )
        if claims.get("azp") != client_id:
            raise jwt.InvalidTokenError(f"token was issued to {claims.get('azp')!r}, not {client_id!r}")
        return claims

    async def _authenticate(self, request):
        token, _ = access_token_and_id_token_from_request(request)
        if not token:
            raise UnauthorizedError()
        try:
            claims = await asyncio.to_thread(_verify, token)
        except Exception as exc:
            print(f"[keycloak] token rejected: {exc!r}", file=sys.stderr)
            raise UnauthorizedError() from None
        roles = sorted((claims.get("resource_access") or {}).get(client_id, {}).get("roles") or [])
        return (
            AuthPrincipal(
                credentials=token,
                name=claims.get("name") or claims.get("preferred_username"),
                sub=claims["sub"],
                aud=claims.get("aud"),
                client_roles={roles_key: roles},
                preferred_username=claims.get("preferred_username"),
                email=claims.get("email"),
                email_verified=claims.get("email_verified"),
                given_name=claims.get("given_name"),
                family_name=claims.get("family_name"),
            ),
            None,
        )

    async def _logged_in_user(principal, auth_service=None):
        extra = principal.model_extra or {}
        return LoggedInUserResponse(
            sub=principal.sub,
            name=principal.name,
            preferred_username=extra.get("preferred_username"),
            given_name=extra.get("given_name"),
            family_name=extra.get("family_name"),
            email=extra.get("email"),
            email_verified=extra.get("email_verified"),
        )

    async def _permissions(self, role_mnemonics):
        granted = set()
        for role in role_mnemonics or []:
            granted |= role_permissions.get(role, set())
        return granted

    validate_and_refresh.ValidateAndRefreshTokenMiddleware._authenticate_with_refresh = _authenticate
    validate_and_refresh.build_logged_in_user = _logged_in_user
    resolve_permissions.ResolvePermissionMiddleware._fetch_permissions_for_roles = _permissions
    print(
        f"[keycloak] iam-core auth via Keycloak active (issuer {issuer}, client {client_id}, "
        f"roles {sorted(role_permissions)})",
        file=sys.stderr,
    )


def _install_standalone():
    from iam_core.schemas import AuthPrincipal
    from iam_core.schemas.logged_in_user import LoggedInUserResponse
    from iam_core.user_auth.helpers.token_helper import access_token_and_id_token_from_request
    from iam_core.user_auth.middleware import resolve_permissions, validate_and_refresh
    from openg2p_fastapi_common.errors.http_exceptions import UnauthorizedError

    session_token = _session_token()
    client_id = os.environ.get("MASTER_DATA_API_KEYCLOAK_CLIENT_ID", "master-data")
    checker_path_markers = ("approve", "reject")

    def _principal(request):
        checker = any(m in request.url.path.lower() for m in checker_path_markers)
        sub = "standalone-checker" if checker else "standalone-admin"
        return AuthPrincipal(
            credentials="standalone",
            name="Standalone Checker" if checker else "Standalone Admin",
            sub=sub,
            preferred_username=sub,
            client_roles={client_id: ["MASTER_DATA_ADMIN"]},
        )

    async def _authenticate(self, request):
        if session_token is not None:
            token, _ = access_token_and_id_token_from_request(request)
            if not token or not hmac.compare_digest(token, session_token):
                raise UnauthorizedError()
        return _principal(request), None

    async def _logged_in_user(principal, auth_service=None):
        return LoggedInUserResponse(
            sub=principal.sub,
            name=principal.name,
            preferred_username=principal.sub,
            email=f"{principal.sub}@mds.local",
            email_verified=True,
        )

    async def _permissions(self, role_mnemonics):
        return set(_ALL_PERMISSIONS)

    validate_and_refresh.ValidateAndRefreshTokenMiddleware._authenticate_with_refresh = _authenticate
    validate_and_refresh.build_logged_in_user = _logged_in_user
    resolve_permissions.ResolvePermissionMiddleware._fetch_permissions_for_roles = _permissions
    print(
        "[standalone] iam-core auth bypass active (admin principal injected"
        + (", login token required)" if session_token else ", no login)"),
        file=sys.stderr,
    )


if os.environ.get("MDS_STANDALONE_AUTH", "").lower() == "true":
    _mode = os.environ.get("MDS_AUTH_MODE", "standalone").strip().lower()
    try:
        if _mode == "keycloak":
            _install_keycloak()
        else:
            _install_standalone()
    except Exception as exc:  # never block start-up; the API then simply enforces auth
        print(f"[{_mode}] auth hooks NOT applied: {exc!r}", file=sys.stderr)

# Patch catalogue_common.validate_value_attributes to strip optional null values before schema check
try:
    import openg2p_gen2_master_data.services.catalogue_common as cc
    _orig_validate = cc.validate_value_attributes

    def _clean_and_validate(schema, value_code, attributes):
        if attributes:
            required = set((schema or {}).get("required") or [])
            cleaned = {}
            for k, v in attributes.items():
                if v is None:
                    prop = (schema or {}).get("properties", {}).get(k, {})
                    p_type = prop.get("type")
                    if p_type == "null" or (isinstance(p_type, list) and "null" in p_type) or k in required:
                        cleaned[k] = v
                else:
                    cleaned[k] = v
            attributes = cleaned
        return _orig_validate(schema, value_code, attributes)

    cc.validate_value_attributes = _clean_and_validate
    print("[standalone] Patched validate_value_attributes to clean optional null values", file=sys.stderr)
except Exception as exc:
    print(f"[standalone] Failed to patch validate_value_attributes: {exc!r}", file=sys.stderr)



# -------------------------------------------------------------
# Patch table_type into G2PAttribute and G2PCatalogueListService
# -------------------------------------------------------------
try:
    from typing import Optional
    from sqlalchemy import Column, String
    from pydantic.fields import FieldInfo
    from openg2p_gen2_master_data.models.g2p_attribute import G2PAttribute
    from openg2p_gen2_master_data.schemas.g2p_catalogue import (
        ListSummary,
        CreateListPayload,
        UpdateListPayload,
    )

    if not hasattr(G2PAttribute, "table_type"):
        G2PAttribute.table_type = Column("table_type", String(20), default="lookup")

    for cls in [ListSummary, CreateListPayload, UpdateListPayload]:
        cls.model_fields["table_type"] = FieldInfo(annotation=Optional[str], default="lookup")
    
    import openg2p_gen2_master_data.schemas.g2p_catalogue as cat_schemas
    from pydantic import BaseModel
    for name, obj in vars(cat_schemas).items():
        if isinstance(obj, type) and issubclass(obj, BaseModel):
            obj.__pydantic_core_schema__ = None
            try:
                obj.model_rebuild(force=True)
            except Exception:
                pass

    import openg2p_gen2_master_data.services.g2p_catalogue_list_service as ls_mod

    orig_get_lists = ls_mod.G2PCatalogueListService.get_lists
    orig_summary = ls_mod.G2PCatalogueListService._summary
    orig_create_list = ls_mod.G2PCatalogueListService.create_list
    orig_update_list = ls_mod.G2PCatalogueListService.update_list

    async def _patched_get_lists(self, include_unpublished: bool = True):
        results = await orig_get_lists(self, include_unpublished=include_unpublished)
        try:
            async with ls_mod.get_async_session_maker()() as session:
                from sqlalchemy import select
                stmt = select(G2PAttribute.attribute_id, G2PAttribute.table_type)
                rows = (await session.execute(stmt)).all()
                type_map = {row[0]: (row[1] or "lookup") for row in rows}
                for item in results:
                    item.table_type = type_map.get(item.list_id, "lookup")
        except Exception as e:
            print(f"[sitecustomize] Failed to query table_type map: {e}", file=sys.stderr)
        return results

    async def _patched_summary(self, session, attr):
        res = await orig_summary(self, session, attr)
        res.table_type = getattr(attr, "table_type", None) or "lookup"
        return res

    async def _patched_create_list(self, payload, actor):
        res, vinfo = await orig_create_list(self, payload, actor)
        tt = getattr(payload, "table_type", None)
        if tt:
            try:
                async with ls_mod.get_async_session_maker()() as session:
                    from sqlalchemy import update
                    stmt = update(G2PAttribute).where(G2PAttribute.attribute_id == res.list_id).values(table_type=tt)
                    await session.execute(stmt)
                    await session.commit()
                res.table_type = tt
            except Exception as e:
                print(f"[sitecustomize] Failed to set table_type on create: {e}", file=sys.stderr)
        return res, vinfo

    async def _patched_update_list(self, payload, actor):
        res, vinfo = await orig_update_list(self, payload, actor)
        tt = getattr(payload, "table_type", None)
        if tt:
            try:
                async with ls_mod.get_async_session_maker()() as session:
                    from sqlalchemy import update
                    stmt = update(G2PAttribute).where(G2PAttribute.attribute_id == res.list_id).values(table_type=tt)
                    await session.execute(stmt)
                    await session.commit()
                res.table_type = tt
            except Exception as e:
                print(f"[sitecustomize] Failed to set table_type on update: {e}", file=sys.stderr)
        return res, vinfo

    ls_mod.G2PCatalogueListService.get_lists = _patched_get_lists
    ls_mod.G2PCatalogueListService._summary = _patched_summary
    ls_mod.G2PCatalogueListService.create_list = _patched_create_list
    ls_mod.G2PCatalogueListService.update_list = _patched_update_list
    print("[standalone] Patched G2PCatalogueListService with table_type support", file=sys.stderr)
except Exception as exc:
    print(f"[standalone] Failed to patch table_type: {exc!r}", file=sys.stderr)
