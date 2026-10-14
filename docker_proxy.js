const net = require('net');

function forward(localPort, targetHost, targetPort) {
  const server = net.createServer(src => {
    const dst = net.connect(targetPort, targetHost);
    src.pipe(dst);
    dst.pipe(src);
    src.on('error', () => dst.destroy());
    dst.on('error', () => src.destroy());
  });

  server.listen(localPort, '127.0.0.1', () => {
    console.log(`[Docker Proxy] Forwarding 127.0.0.1:${localPort} -> ${targetHost}:${targetPort}`);
  });

  server.on('error', err => {
    console.error(`[Docker Proxy] Error on port ${localPort}:`, err);
  });
}

forward(8020, 'host.docker.internal', 8020);
forward(8080, 'host.docker.internal', 8080);
