const http = require('http');

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  res.setHeader('Content-Type', 'application/json');

  if (url.pathname === '/auth/get_logged_in_user') {
    res.writeHead(200);
    res.end(JSON.stringify({
      id: "1",
      sub: "admin",
      name: "Administrator",
      preferred_username: "admin",
      email: "admin@openg2p.org"
    }));
  } else if (url.pathname.includes('/user-access/get_application_permissions_for_user')) {
    res.writeHead(200);
    res.end(JSON.stringify([
      {
        application_mnemonic: "farmer-registry-staff-portal",
        permissions: [
          "referenceData:publish",
          "referenceData:read",
          "referenceData:write",
          "geo:publish",
          "geo:read",
          "geo:write",
          "catalogue:read",
          "catalogue:write",
          "catalogue:publish"
        ]
      }
    ]));
  } else if (url.pathname === '/user-access/get_permissions_for_roles') {
    res.writeHead(200);
    res.end(JSON.stringify({
      permissions: [
        "referenceData:publish",
        "referenceData:read",
        "referenceData:write",
        "geo:publish",
        "geo:read",
        "geo:write",
        "catalogue:read",
        "catalogue:write",
        "catalogue:publish"
      ]
    }));
  } else if (url.pathname === '/auth/start_authentication_transaction') {
    const redirectUri = url.searchParams.get('redirect_uri') || '/en';
    res.writeHead(200);
    res.end(JSON.stringify({ redirectUrl: redirectUri }));
  } else if (url.pathname === '/auth/logout') {
    res.writeHead(302, { Location: '/en' });
    res.end();
  } else {
    res.writeHead(200);
    res.end(JSON.stringify({ status: "ok" }));
  }
});

server.listen(8020, '0.0.0.0', () => {
  console.log('[Mock IAM] Listening on 8020');
});
