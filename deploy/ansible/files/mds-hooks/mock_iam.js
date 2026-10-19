// Mock OpenG2P IAM for standalone MDS. Runs as the `mock-iam` sidecar in the UI pod.
//
// Server side (UI -> http://localhost:8020, the UI's IAM_URL):
//   POST /auth/start_authentication_transaction           -> { redirectUrl: <public>/mock-iam/login (or /callback) }
//   GET  /auth/get_logged_in_user                         -> admin profile
//   GET  /user-access/get_application_permissions_for_user -> every master-data permission
// Browser side (ingress routes https://<ui-host>/mock-iam/* and /api/logout here):
//   GET  /mock-iam/login?redirect_uri=...  -> username/password form
//   POST /mock-iam/login                    -> on success sets the X-Access-Token cookie, redirects back
//   GET  /mock-iam/callback?redirect_uri=.. -> auto-login (only when no password is configured)
//   GET  /mock-iam/logout, /api/logout      -> clears the cookies
//
// Login: with MDS_LOGIN_PASSWORD set, the session token is derived from the username and
// password; the API's sitecustomize.py accepts only that token, and the server-side calls
// above answer 401 without it. Without a password everyone is auto-logged in as admin.
//
// MDS_AUTH_MODE=keycloak turns this into a small OIDC bridge to Keycloak instead:
//   start_authentication_transaction -> Keycloak's login page (authorization code + PKCE)
//   GET /mock-iam/oidc/callback        -> exchanges the code (confidential client), stores the
//                                         Keycloak access/id tokens in the cookies the UI reads
//   get_logged_in_user / permissions   -> verify the JWT (JWKS, issuer, azp, exp) and map the
//                                         token's client roles through MDS_ROLE_PERMISSIONS
//   logout                             -> clears the cookies and ends the Keycloak session
// The API's sitecustomize.py verifies the same token, so both sides agree on who is logged in.
const crypto = require("crypto");
const http = require("http");

const PORT = Number(process.env.MOCK_IAM_PORT || 8020);
const PUBLIC_URL = (process.env.MOCK_IAM_PUBLIC_URL || "").replace(/\/$/, "");
const APP = process.env.APPLICATION_MNEMONIC || "master-data";
const KEYCLOAK = (process.env.MDS_AUTH_MODE || "").toLowerCase() === "keycloak";
const KC_ISSUER = (process.env.MDS_KEYCLOAK_ISSUER || "").replace(/\/$/, "");
const KC_INTERNAL = (process.env.MDS_KEYCLOAK_INTERNAL_URL || KC_ISSUER).replace(/\/$/, "");
const KC_CLIENT_ID = process.env.MDS_KEYCLOAK_CLIENT_ID || "master-data";
const KC_CLIENT_SECRET = process.env.MDS_KEYCLOAK_CLIENT_SECRET || "";
const KC_CALLBACK = `${PUBLIC_URL}/mock-iam/oidc/callback`;
const ROLE_PERMISSIONS = JSON.parse(process.env.MDS_ROLE_PERMISSIONS || "{}");
const LOGIN_USER = process.env.MDS_LOGIN_USERNAME || "admin";
const LOGIN_PASSWORD = process.env.MDS_LOGIN_PASSWORD || "";
const LOGIN_ENABLED = LOGIN_PASSWORD.length > 0;
const TOKEN = LOGIN_ENABLED
  ? crypto.createHash("sha256").update(`mds-standalone-session:${LOGIN_USER}:${LOGIN_PASSWORD}`).digest("hex")
  : "standalone";
const PERMISSIONS = [
  "referenceData:create",
  "referenceData:edit",
  "referenceData:delete",
  "referenceData:publish",
  "geo:create",
  "geo:edit",
  "geo:delete",
  "geo:publish",
];
const USER = {
  sub: "standalone-admin",
  name: "Standalone Admin",
  preferred_username: LOGIN_USER,
  given_name: "Standalone",
  family_name: "Admin",
  email: "admin@mds.local",
  email_verified: true,
  address: {},
};
const COOKIE_ATTRS = "Path=/; Secure; SameSite=Lax";

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function redirect(res, location, cookies = []) {
  res.writeHead(302, { Location: location, "Set-Cookie": cookies });
  res.end();
}

// Only redirect back to our own UI host (no open redirect).
function safeRedirect(target) {
  if (!target) return "/";
  if (target.startsWith("/") && !target.startsWith("//")) return target;
  if (PUBLIC_URL && (target === PUBLIC_URL || target.startsWith(PUBLIC_URL + "/"))) return target;
  return "/";
}

function sameSecret(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// The UI forwards the session as "Authorization: Bearer <token>" and/or the X-Access-Token cookie.
function requestToken(req) {
  const auth = req.headers.authorization || "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  const m = (req.headers.cookie || "").match(/(?:^|;\s*)X-Access-Token=([^;]*)/);
  return m ? decodeURIComponent(m[1]) : "";
}

function authorized(req) {
  return !LOGIN_ENABLED || sameSecret(requestToken(req), TOKEN);
}

// The UI only redirects to /api/login (-> our login form) on this code; any other 401
// leaves it on its loading screen.
function loginRequired(res) {
  return json(res, 401, { errors: [{ code: "G2P-AUT-LOGIN-REQUIRED", message: "Login required: session has ended" }] });
}

function sessionCookies() {
  return [
    `X-Access-Token=${TOKEN}; HttpOnly; ${COOKIE_ATTRS}`,
    `X-Session-Id=standalone; HttpOnly; ${COOKIE_ATTRS}`,
    `X-CSRF-Token=standalone; ${COOKIE_ATTRS}`,
  ];
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function loginPage(res, status, back, error) {
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Frame-Options": "DENY",
  });
  res.end(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sign in - Master Data Catalogue</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f4f5f7;
       font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1f2937}
  form{background:#fff;width:100%;max-width:360px;margin:16px;padding:32px;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,.08)}
  h1{margin:0 0 4px;font-size:22px} p{margin:0 0 24px;color:#6b7280;font-size:14px}
  label{display:block;font-size:14px;font-weight:600;margin:16px 0 6px}
  input{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:15px}
  input:focus{outline:2px solid #f5b800;border-color:#f5b800}
  button{width:100%;margin-top:24px;padding:11px;border:0;border-radius:8px;background:#f5b800;color:#111;font-size:15px;font-weight:600;cursor:pointer}
  .err{background:#fef2f2;color:#b91c1c;border-radius:8px;padding:10px 12px;font-size:14px;margin-bottom:8px}
</style></head><body>
<form method="post" action="/mock-iam/login">
  <h1>Catalogue</h1><p>Sign in to the Master Data Catalogue</p>
  ${error ? `<div class="err">${escapeHtml(error)}</div>` : ""}
  <input type="hidden" name="redirect_uri" value="${escapeHtml(back)}">
  <label for="u">Username</label><input id="u" name="username" autocomplete="username" required autofocus>
  <label for="p">Password</label><input id="p" name="password" type="password" autocomplete="current-password" required>
  <button type="submit">Sign in</button>
</form></body></html>`);
}

// ---------------------------------------------------------------- Keycloak mode
const b64url = (buf) => Buffer.from(buf).toString("base64url");
const OIDC_COOKIE = "mds-oidc";

let jwksCache = { keys: new Map(), fetchedAt: 0 };

// Keys are cached; an unknown kid (key rotation) refetches, at most every 30 seconds.
async function signingKey(kid) {
  if (!jwksCache.keys.has(kid) && Date.now() - jwksCache.fetchedAt > 30 * 1000) {
    const res = await fetch(`${KC_INTERNAL}/protocol/openid-connect/certs`);
    if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
    const keys = new Map();
    for (const jwk of (await res.json()).keys || []) {
      if (jwk.use === "sig" && jwk.kty === "RSA") keys.set(jwk.kid, crypto.createPublicKey({ key: jwk, format: "jwk" }));
    }
    jwksCache = { keys, fetchedAt: Date.now() };
  }
  const key = jwksCache.keys.get(kid);
  if (!key) throw new Error(`unknown signing key ${kid}`);
  return key;
}

// Returns the token's claims, or null when it is missing, forged, expired or not ours.
async function verifyToken(token) {
  try {
    const [h, p, s] = String(token || "").split(".");
    if (!h || !p || !s) return null;
    const header = JSON.parse(Buffer.from(h, "base64url"));
    if (header.alg !== "RS256") return null;
    const ok = crypto.verify("RSA-SHA256", Buffer.from(`${h}.${p}`), await signingKey(header.kid), Buffer.from(s, "base64url"));
    if (!ok) return null;
    const claims = JSON.parse(Buffer.from(p, "base64url"));
    const now = Math.floor(Date.now() / 1000);
    if (claims.iss !== KC_ISSUER || claims.azp !== KC_CLIENT_ID || !(claims.exp > now - 30)) return null;
    return claims;
  } catch (e) {
    console.log(`[mock-iam] token check failed: ${e.message}`);
    return null;
  }
}

function tokenRoles(claims) {
  return ((claims.resource_access || {})[KC_CLIENT_ID] || {}).roles || [];
}

function tokenPermissions(claims) {
  const out = new Set();
  for (const role of tokenRoles(claims)) for (const p of ROLE_PERMISSIONS[role] || []) out.add(p);
  return [...out].sort();
}

function profile(claims) {
  return {
    sub: claims.sub,
    name: claims.name || claims.preferred_username,
    preferred_username: claims.preferred_username,
    given_name: claims.given_name,
    family_name: claims.family_name,
    email: claims.email,
    email_verified: claims.email_verified,
    address: {},
  };
}

// The PKCE verifier, nonce and return path ride in a short-lived cookie, HMAC-signed so the
// browser cannot swap them.
function sign(data) {
  return crypto.createHmac("sha256", KC_CLIENT_SECRET).update(data).digest("base64url");
}

function packState(obj) {
  const data = b64url(JSON.stringify(obj));
  return `${data}.${sign(data)}`;
}

function unpackState(value) {
  const [data, mac] = String(value || "").split(".");
  if (!data || !mac || !sameSecret(mac, sign(data))) return null;
  const obj = JSON.parse(Buffer.from(data, "base64url"));
  return Date.now() - obj.t < 10 * 60 * 1000 ? obj : null;
}

function cookieValue(req, name) {
  const m = (req.headers.cookie || "").match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : "";
}

function keycloakLoginUrl(back) {
  const verifier = b64url(crypto.randomBytes(32));
  const state = b64url(crypto.randomBytes(16));
  const nonce = b64url(crypto.randomBytes(16));
  const params = new URLSearchParams({
    client_id: KC_CLIENT_ID,
    response_type: "code",
    scope: "openid profile email",
    redirect_uri: KC_CALLBACK,
    state,
    nonce,
    code_challenge: b64url(crypto.createHash("sha256").update(verifier).digest()),
    code_challenge_method: "S256",
  });
  return {
    url: `${KC_ISSUER}/protocol/openid-connect/auth?${params}`,
    cookie: `${OIDC_COOKIE}=${packState({ state, nonce, verifier, back, t: Date.now() })}; HttpOnly; Max-Age=600; ${COOKIE_ATTRS}`,
  };
}

async function keycloakCallback(req, res, url) {
  const saved = unpackState(cookieValue(req, OIDC_COOKIE));
  const clearState = `${OIDC_COOKIE}=; Max-Age=0; ${COOKIE_ATTRS}`;
  if (url.searchParams.get("error")) {
    console.log(`[mock-iam] keycloak returned ${url.searchParams.get("error")}`);
    return redirect(res, "/", [clearState]);
  }
  if (!saved || !sameSecret(url.searchParams.get("state") || "", saved.state)) {
    // Stale or replayed callback: start a fresh login.
    const login = keycloakLoginUrl(saved ? saved.back : "/");
    return redirect(res, login.url, [login.cookie]);
  }
  const tokenRes = await fetch(`${KC_INTERNAL}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: url.searchParams.get("code") || "",
      redirect_uri: KC_CALLBACK,
      client_id: KC_CLIENT_ID,
      client_secret: KC_CLIENT_SECRET,
      code_verifier: saved.verifier,
    }),
  });
  const tokens = await tokenRes.json().catch(() => ({}));
  const claims = tokenRes.ok ? await verifyToken(tokens.access_token) : null;
  if (!claims) {
    console.log(`[mock-iam] code exchange failed: ${tokenRes.status} ${tokens.error || ""} ${tokens.error_description || ""}`);
    return json(res, 502, { error: "login failed", detail: tokens.error_description || tokens.error || "invalid token" });
  }
  // The id token came straight from Keycloak over the back channel; only its nonce is checked.
  const idPayload = String(tokens.id_token || "").split(".")[1];
  const idClaims = idPayload ? JSON.parse(Buffer.from(idPayload, "base64url")) : {};
  if (!sameSecret(idClaims.nonce || "", saved.nonce)) {
    return json(res, 502, { error: "login failed", detail: "id token missing or nonce mismatch" });
  }
  console.log(`[mock-iam] keycloak login ok for ${claims.preferred_username} roles=${tokenRoles(claims).join(",")}`);
  return redirect(res, safeRedirect(saved.back), [
    `X-Access-Token=${tokens.access_token}; HttpOnly; ${COOKIE_ATTRS}`,
    `X-ID-Token=${tokens.id_token || ""}; HttpOnly; ${COOKIE_ATTRS}`,
    `X-Session-Id=${claims.sid || b64url(crypto.randomBytes(12))}; HttpOnly; ${COOKIE_ATTRS}`,
    `X-CSRF-Token=${b64url(crypto.randomBytes(16))}; ${COOKIE_ATTRS}`,
    clearState,
  ]);
}

async function keycloakHandler(req, res, url, path) {
  if (path === "/auth/start_authentication_transaction") {
    // Called server-side by the UI; the browser follows redirectUrl. The state cookie must be
    // set on the browser, so send it to /mock-iam/login first, which redirects to Keycloak.
    const back = url.searchParams.get("redirect_uri") || "/";
    return json(res, 200, { redirectUrl: `${PUBLIC_URL}/mock-iam/login?redirect_uri=${encodeURIComponent(back)}` });
  }
  if (path === "/mock-iam/login" || path === "/mock-iam/callback") {
    const login = keycloakLoginUrl(safeRedirect(url.searchParams.get("redirect_uri")));
    return redirect(res, login.url, [login.cookie]);
  }
  if (path === "/mock-iam/oidc/callback") return keycloakCallback(req, res, url);
  if (path === "/auth/get_logged_in_user") {
    const claims = await verifyToken(requestToken(req));
    return claims ? json(res, 200, profile(claims)) : loginRequired(res);
  }
  if (path === "/user-access/get_application_permissions_for_user") {
    const claims = await verifyToken(requestToken(req));
    if (!claims) return loginRequired(res);
    return json(res, 200, [
      { application_mnemonic: url.searchParams.get("application_mnemonic") || APP, permissions: tokenPermissions(claims) },
    ]);
  }
  if (path === "/mock-iam/logout" || path === "/auth/logout" || path === "/api/logout") {
    const expired = "Max-Age=0; " + COOKIE_ATTRS;
    const params = new URLSearchParams({ client_id: KC_CLIENT_ID, post_logout_redirect_uri: `${PUBLIC_URL}/` });
    const idToken = cookieValue(req, "X-ID-Token");
    if (idToken) params.set("id_token_hint", idToken);
    return redirect(res, `${KC_ISSUER}/protocol/openid-connect/logout?${params}`, [
      `X-Access-Token=; ${expired}`,
      `X-ID-Token=; ${expired}`,
      `X-Session-Id=; ${expired}`,
      `X-CSRF-Token=; ${expired}`,
    ]);
  }
  if (path === "/healthz") return json(res, 200, { status: "ok", mode: "keycloak" });
  return json(res, 404, { error: "not found", path });
}

// ---------------------------------------------------------------- standalone mode
function readForm(req, limit = 8192) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > limit) reject(new Error("form too large"));
    });
    req.on("end", () => resolve(new URLSearchParams(body)));
    req.on("error", reject);
  });
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const path = url.pathname;

    if (KEYCLOAK) {
      try {
        return await keycloakHandler(req, res, url, path);
      } catch (e) {
        console.log(`[mock-iam] ${path} failed: ${e.message}`);
        return json(res, 502, { error: "identity provider unavailable" });
      }
    }

    if (path === "/auth/start_authentication_transaction") {
      const back = url.searchParams.get("redirect_uri") || "/";
      const step = LOGIN_ENABLED ? "login" : "callback";
      return json(res, 200, {
        redirectUrl: `${PUBLIC_URL}/mock-iam/${step}?redirect_uri=${encodeURIComponent(back)}`,
      });
    }
    if (path === "/mock-iam/login") {
      if (!LOGIN_ENABLED) return redirect(res, safeRedirect(url.searchParams.get("redirect_uri")), sessionCookies());
      if (req.method === "POST") {
        let form;
        try {
          form = await readForm(req);
        } catch (e) {
          return json(res, 413, { error: "request too large" });
        }
        const back = safeRedirect(form.get("redirect_uri"));
        if (sameSecret(form.get("username") || "", LOGIN_USER) && sameSecret(form.get("password") || "", LOGIN_PASSWORD)) {
          console.log(`[mock-iam] login ok for ${LOGIN_USER}`);
          return redirect(res, back, sessionCookies());
        }
        console.log("[mock-iam] login failed");
        // Slow down password guessing.
        return setTimeout(() => loginPage(res, 401, back, "Incorrect username or password."), 1000);
      }
      return loginPage(res, 200, safeRedirect(url.searchParams.get("redirect_uri")), "");
    }
    if (path === "/mock-iam/callback") {
      if (LOGIN_ENABLED) {
        return redirect(res, `/mock-iam/login?redirect_uri=${encodeURIComponent(safeRedirect(url.searchParams.get("redirect_uri")))}`);
      }
      return redirect(res, safeRedirect(url.searchParams.get("redirect_uri")), sessionCookies());
    }
    if (path === "/auth/get_logged_in_user") {
      if (!authorized(req)) return loginRequired(res);
      return json(res, 200, USER);
    }
    if (path === "/user-access/get_application_permissions_for_user") {
      if (!authorized(req)) return loginRequired(res);
      return json(res, 200, [
        { application_mnemonic: url.searchParams.get("application_mnemonic") || APP, permissions: PERMISSIONS },
      ]);
    }
    // /api/logout is the UI's own logout route (it would redirect the browser to
    // IAM_URL=localhost:8020); the UI ingress sends it here instead.
    if (path === "/mock-iam/logout" || path === "/auth/logout" || path === "/api/logout") {
      const expired = "Max-Age=0; " + COOKIE_ATTRS;
      return redirect(res, "/", [
        `X-Access-Token=; ${expired}`,
        `X-Session-Id=; ${expired}`,
        `X-CSRF-Token=; ${expired}`,
      ]);
    }
    if (path === "/healthz") {
      return json(res, 200, { status: "ok" });
    }
    return json(res, 404, { error: "not found", path });
  })
  .listen(PORT, "0.0.0.0", () =>
    console.log(
      `[mock-iam] listening on :${PORT}, public ${PUBLIC_URL || "(unset)"}, ` +
        (KEYCLOAK
          ? `keycloak ${KC_ISSUER} (client ${KC_CLIENT_ID}, roles ${Object.keys(ROLE_PERMISSIONS).join(",")})`
          : `login ${LOGIN_ENABLED ? "required" : "off (auto-login)"}`),
    ),
  );
