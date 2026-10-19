import socket
import threading
import sys

def forward(src, dst):
    try:
        while True:
            data = src.recv(4096)
            if not data:
                break
            dst.sendall(data)
    except Exception:
        pass
    finally:
        try:
            src.close()
        except Exception:
            pass
        try:
            dst.close()
        except Exception:
            pass

def serve(local_port, target_host, target_port):
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        server.bind(('127.0.0.1', local_port))
        server.listen(20)
        print(f"[Docker Proxy] Listening on 127.0.0.1:{local_port} -> {target_host}:{target_port}")
        while True:
            client, _ = server.accept()
            target = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            try:
                target.connect((target_host, target_port))
                threading.Thread(target=forward, args=(client, target), daemon=True).start()
                threading.Thread(target=forward, args=(target, client), daemon=True).start()
            except Exception:
                client.close()
    except Exception as e:
        print(f"[Docker Proxy] Error binding {local_port}: {e}", file=sys.stderr)

if __name__ == '__main__':
    t1 = threading.Thread(target=serve, args=(8080, 'host.docker.internal', 8080), daemon=True)
    t1.start()
    serve(8020, 'host.docker.internal', 8020)
