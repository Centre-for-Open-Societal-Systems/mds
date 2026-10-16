# Standalone hook files

These hooks make the **official** OpenG2P images (`openg2p/master-data-api`, `openg2p/master-data-ui`) run without Keycloak or the OpenG2P IAM. The images stay unmodified.

| File | Runs in | Purpose |
|---|---|---|
| `sitecustomize.py` | API container, loaded automatically by Python (`PYTHONPATH=/opt/mds-hooks`, `MDS_STANDALONE_AUTH=true`) | Replaces iam-core token validation and permission lookup with a fixed admin principal that has every `referenceData:*` and `geo:*` permission. Approve and reject calls run as a second identity ("checker"), so maker-checker still works with one login |
| `mock_iam.js` | `mock-iam` sidecar in the UI pod (port 8020) | Answers the UI's IAM calls (`start_authentication_transaction`, `get_logged_in_user`, `get_application_permissions_for_user`). It also serves `/mock-iam/callback` through the ingress to set the `X-Access-Token` cookie the UI checks |

**Keycloak mode** (`mds_keycloak_enabled: true`, sets `MDS_AUTH_MODE=keycloak` on both containers): `mock_iam.js` becomes an OIDC bridge to the shared Keycloak (playbook `05-keycloak.yml`), and `sitecustomize.py` verifies the Keycloak JWT and maps the token's `master-data` client roles to permissions (`MDS_ROLE_PERMISSIONS`). The principal is the real user, so the checker identity trick is off and the API's own maker ≠ checker rule applies between people. The limitations below then no longer apply: login is per user, and logout works.

Ansible puts every `*.js` and `*.py` file in this folder into the `mds-hooks` ConfigMap, mounted at `/opt/mds-hooks`. In standalone mode, `03-deploy-mds.yml` stops with an error if either file is missing.

**Limitations of standalone mode:**
- Anyone who can reach the UI is an admin. Restrict access with `mds_ingress_allowlist_cidrs`, basic auth, or a VPN.
- **Logout** sends the browser to the UI's internal IAM URL, so it shows an error page. Open `https://<ui-host>/mock-iam/logout` instead.
- These hooks patch iam-core internals (`ValidateAndRefreshTokenMiddleware`, `ResolvePermissionMiddleware`). After you change the image tag, check the API log for `[standalone] iam-core auth bypass active`.
