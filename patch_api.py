import os

main_py = "/usr/local/lib/python3.12/site-packages/openg2p_gen2_master_data/main.py"
if os.path.exists(main_py):
    with open(main_py, "r") as f:
        code = f.read()

    target = """# Middleware order (last added = outermost on inbound):
# CSRF -> ValidateAndRefresh -> ResolvePermission -> DataPolicy -> app
app.add_middleware(
    DataPolicyMiddleware,
    iam_api_url=_config.auth_provider_api_url,
)
app.add_middleware(
    ResolvePermissionMiddleware,
    client_id=_config.keycloak_client_id,
    allow_by_default=True,
)
app.add_middleware(ValidateAndRefreshTokenMiddleware)"""

    replacement = """# Middleware order (last added = outermost on inbound):
# CSRF -> ValidateAndRefresh -> ResolvePermission -> DataPolicy -> app
if _config.auth_enabled:
    app.add_middleware(
        DataPolicyMiddleware,
        iam_api_url=_config.auth_provider_api_url,
    )
    app.add_middleware(
        ResolvePermissionMiddleware,
        client_id=_config.keycloak_client_id,
        allow_by_default=True,
    )
    app.add_middleware(ValidateAndRefreshTokenMiddleware)
else:
    from starlette.middleware.base import BaseHTTPMiddleware
    from iam_core.schemas import AuthPrincipal
    class StandaloneAuthMiddleware(BaseHTTPMiddleware):
        async def dispatch(self, request, call_next):
            request.state.auth = AuthPrincipal(credentials="standalone-token", sub="admin", name="Admin", client_roles={})
            request.state.permissions = {"referenceData:publish", "geo:publish", "referenceData:read", "referenceData:write", "geo:read", "geo:write", "catalogue:read", "catalogue:write", "catalogue:publish"}
            return await call_next(request)
    app.add_middleware(StandaloneAuthMiddleware)"""

    if target in code:
        code = code.replace(target, replacement)
        with open(main_py, "w") as f:
            f.write(code)
        print("[MDS Standalone] Successfully patched main.py for standalone auth bypass.")
    else:
        print("[MDS Standalone] main.py already patched or target pattern not found.")
