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
