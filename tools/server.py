# Kleiner lokaler Webserver für die Trainings-Kamera.
#   python3 tools/server.py            -> nur auf diesem Rechner (http://localhost:8765)
#   python3 tools/server.py --lan      -> zusätzlich fürs Heimnetz (https://<IP>:8766), damit Handy und Tablet zugreifen können
# Enthält eine kleine "Vermittlung", über die sich Handy und Tablet finden. Das Video selbst läuft nie über diesen Server.
import http.server, json, os, queue, socket, ssl, subprocess, sys, threading, time, webbrowser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARGS = sys.argv[1:]
PORT = int(next((a for a in ARGS if a.isdigit()), 8765))
LAN = '--lan' in ARGS
TESTLOG = next((a.split('=', 1)[1] for a in ARGS if a.startswith('--testlog=')), None)

subs = {}                 # Thema -> Liste von Warteschlangen (ein Eintrag je zuhörendem Gerät)
lock = threading.Lock()
lan_url = None


def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('192.0.2.1', 9))  # sendet nichts, ermittelt nur die eigene Adresse im Netz
        return s.getsockname()[0]
    except OSError:
        return None
    finally:
        s.close()


class Handler(http.server.SimpleHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      '.js': 'text/javascript', '.wasm': 'application/wasm', '.tflite': 'application/octet-stream',
                      '.webmanifest': 'application/manifest+json'}

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def log_message(self, *a):
        pass

    def setup(self):
        # TLS-Handschlag erst hier im eigenen Thread – ein hängendes Gerät blockiert so nicht alle anderen
        if isinstance(self.request, ssl.SSLSocket):
            self.request.settimeout(15)
            self.request.do_handshake()
            self.request.settimeout(None)
        super().setup()

    def _text(self, code, body, ctype='text/plain; charset=utf-8'):
        data = body.encode()
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _relay_topic(self):
        parts = self.path.split('?')[0].strip('/').split('/')
        return parts[2:] if parts[:2] == ['api', 'relay'] else None

    def do_GET(self):
        path = self.path.split('?')[0]
        if path == '/api/info':
            return self._text(200, json.dumps({'lan': lan_url}), 'application/json')
        t = self._relay_topic()
        if t == ['ping']:
            return self._text(200, 'pong')
        if t and len(t) == 2 and t[1] == 'sse':
            return self._sse(t[0])
        if path.startswith('/api/'):
            return self._text(404, 'not found')
        super().do_GET()

    def do_POST(self):
        body = self.rfile.read(int(self.headers.get('Content-Length') or 0)).decode('utf-8', 'replace')
        path = self.path.split('?')[0]
        t = self._relay_topic()
        if t and len(t) == 1 and len(body) < 8000:
            with lock:
                for q in subs.get(t[0], []):
                    q.put(body)
            return self._text(200, '{}', 'application/json')
        if path == '/api/testlog' and TESTLOG:
            with lock, open(TESTLOG, 'a') as f:
                f.write(body + '\n')
            return self._text(200, 'ok')
        self._text(404, 'not found')

    def _sse(self, topic):
        q = queue.Queue()
        with lock:
            subs.setdefault(topic, []).append(q)
        try:
            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream')
            self.send_header('Connection', 'close')
            self.end_headers()
            self.close_connection = True
            self.wfile.write(b'event: open\ndata: {"event":"open"}\n\n')
            self.wfile.flush()
            while True:
                try:
                    msg = q.get(timeout=20)
                    self.wfile.write(('data: ' + json.dumps({'event': 'message', 'message': msg}) + '\n\n').encode())
                except queue.Empty:
                    self.wfile.write(b': keepalive\n\n')
                self.wfile.flush()
        except (OSError, ssl.SSLError):
            pass
        finally:
            with lock:
                subs[topic].remove(q)
                if not subs[topic]:
                    del subs[topic]


class Server(http.server.ThreadingHTTPServer):
    daemon_threads = True
    ctx = None

    def get_request(self):
        sock, addr = self.socket.accept()
        if self.ctx:
            sock = self.ctx.wrap_socket(sock, server_side=True, do_handshake_on_connect=False)
        return sock, addr

    def handle_error(self, request, client_address):
        pass  # abgebrochene Verbindungen (z. B. Zertifikats-Warnung am Handy) nicht ins Fenster schreiben


def make_cert(ip):
    """Selbst ausgestelltes Zertifikat für die Adresse im Heimnetz (Handys geben die Kamera nur über https frei)."""
    d = os.path.join(ROOT, 'tools', '.cert')
    os.makedirs(d, exist_ok=True)
    cert, key, mark = (os.path.join(d, n) for n in ('cert.pem', 'key.pem', 'ip.txt'))
    if os.path.exists(cert) and os.path.exists(mark) and open(mark).read() == ip:
        return cert, key
    subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert,
                    '-days', '800', '-subj', '/CN=Trainings-Kamera', '-addext', 'subjectAltName=IP:%s,DNS:localhost' % ip],
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    open(mark, 'w').write(ip)
    return cert, key


if __name__ == '__main__':
    local = Server(('127.0.0.1', PORT), Handler)
    url = 'http://localhost:%d/' % PORT
    print('Trainings-Kamera läuft. Dieses Fenster offen lassen (Strg+C beendet).')
    print('  An diesem Rechner:   ' + url)
    if LAN:
        ip = lan_ip()
        try:
            cert, key = make_cert(ip)
            ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            ctx.load_cert_chain(cert, key)
            wide = Server(('0.0.0.0', PORT + 1), Handler)
            wide.ctx = ctx
            threading.Thread(target=wide.serve_forever, daemon=True).start()
            lan_url = 'https://%s:%d/' % (ip, PORT + 1)
            print('  Tablet und Handy:    ' + lan_url)
            print('  (Beim ersten Öffnen warnt Safari vor dem Zertifikat: "Details einblenden" > "diese Website öffnen".)')
        except Exception as e:
            print('  Zugriff aus dem Heimnetz nicht möglich: %s' % e)
    if '--no-browser' not in ARGS:
        webbrowser.open(url + ('start.html' if lan_url else ''))
    try:
        local.serve_forever()
    except KeyboardInterrupt:
        pass
