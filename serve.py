#!/usr/bin/env python3
"""
Lightweight local development server with automatic browser reload (LiveReload).
Zero external dependencies - uses standard library Python.
"""

import os
import sys
import time
import queue
import pathlib
import threading
import webbrowser
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

PORT = 8000
WATCH_EXTENSIONS = {'.html', '.css', '.js', '.json', '.svg', '.png', '.jpg', '.jpeg'}
IGNORE_DIRS = {'.git', '__pycache__', 'scratch', '.vscode', 'data'}
IGNORE_FILES = {'words.js', 'words.json'}

# Thread-safe queue list for connected SSE clients
subscribers_lock = threading.Lock()
subscribers = []
shutdown_event = threading.Event()

INJECTED_SNIPPET = """
<!-- Development Auto-reload Script -->
<div class="dev-indicator" id="__dev_indicator" title="Local Development Server">
  <span class="pulse-dot"></span> Local Dev &bull; Auto-reload Active
</div>
<script>
(function() {
  let retryCount = 0;
  function connect() {
    const es = new EventSource('/__livereload');
    es.onopen = function() {
      if (retryCount > 0) {
        console.log('[DevServer] Reconnected to auto-reload server.');
      }
      retryCount = 0;
    };
    es.onmessage = function(event) {
      if (event.data === 'reload') {
        console.log('[DevServer] File change detected, reloading page...');
        location.reload();
      }
    };
    es.onerror = function() {
      es.close();
      retryCount++;
      const delay = Math.min(1000 * Math.pow(1.5, retryCount), 5000);
      setTimeout(connect, delay);
    };
  }
  connect();
})();
</script>
"""

class DevServerHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # Prevent browser caching during local development
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def do_GET(self):
        # Handle LiveReload SSE stream
        if self.path == '/__livereload':
            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream')
            self.send_header('Cache-Control', 'no-cache')
            self.send_header('Connection', 'keep-alive')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()

            client_queue = queue.Queue()
            with subscribers_lock:
                subscribers.append(client_queue)

            try:
                # Send initial handshake comment
                self.wfile.write(b": connected\n\n")
                self.wfile.flush()

                while not shutdown_event.is_set():
                    try:
                        msg = client_queue.get(timeout=2.0)
                        self.wfile.write(f"data: {msg}\n\n".encode('utf-8'))
                        self.wfile.flush()
                    except queue.Empty:
                        # Send heartbeat to keep connection alive
                        self.wfile.write(b": heartbeat\n\n")
                        self.wfile.flush()
            except (ConnectionError, OSError):
                pass
            finally:
                with subscribers_lock:
                    if client_queue in subscribers:
                        subscribers.remove(client_queue)
            return

        clean_path = self.path.split('?')[0].split('#')[0]

        # Handle sw.js if a browser previously registered a service worker on localhost
        if clean_path == '/sw.js' and not os.path.exists('sw.js'):
            self.send_response(200)
            self.send_header('Content-Type', 'application/javascript')
            self.send_header('Content-Length', '0')
            self.end_headers()
            return

        # Intercept favicon fallback if .ico or png sizes are requested
        if clean_path in ('/favicon.ico', '/favicon-32x32.png', '/favicon-16x16.png') and not os.path.exists(clean_path.lstrip('/')):
            if os.path.exists('favicon.svg'):
                self.send_response(302)
                self.send_header('Location', '/favicon.svg')
                self.end_headers()
                return

        # Intercept HTML requests to inject auto-reload script
        if clean_path == '/' or clean_path.endswith('.html'):
            filepath = 'index.html' if clean_path == '/' else clean_path.lstrip('/')
            if os.path.exists(filepath) and os.path.isfile(filepath):
                try:
                    with open(filepath, 'r', encoding='utf-8') as f:
                        content = f.read()

                    if '</body>' in content:
                        modified_content = content.replace('</body>', f'{INJECTED_SNIPPET}\n</body>')
                    else:
                        modified_content = content + INJECTED_SNIPPET

                    encoded = modified_content.encode('utf-8')
                    self.send_response(200)
                    self.send_header('Content-Type', 'text/html; charset=utf-8')
                    self.send_header('Content-Length', str(len(encoded)))
                    self.end_headers()
                    self.wfile.write(encoded)
                    return
                except Exception as e:
                    print(f"[DevServer] Error injecting livereload: {e}")

        # Default static file serving
        return super().do_GET()

    def do_POST(self):
        if self.path == '/api/save':
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            try:
                import json
                data = json.loads(body)
                os.makedirs('data', exist_ok=True)
                with open('data/words.json', 'w', encoding='utf-8') as f:
                    json.dump(data, f, indent=2, ensure_ascii=False)

                # Also write to js/words.js for dual compatibility
                words_js_content = "/**\n * Curated Personal Dictionary entries.\n */\nexport const INITIAL_WORDS = " + json.dumps(data, indent=2, ensure_ascii=False) + ";\n"
                with open('js/words.js', 'w', encoding='utf-8') as f:
                    f.write(words_js_content)

                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(b'{"ok": true}')
                return
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(f'{{"error": "{str(e)}"}}'.encode('utf-8'))
                return
        self.send_response(404)
        self.end_headers()

    def log_message(self, format, *args):
        # Filter out noisy SSE heartbeats from console output
        if args and len(args) > 0 and '__livereload' in str(args[0]):
            return
        super().log_message(format, *args)


def get_files_snapshot(base_dir):
    """Get snapshot mapping file paths to their modification times."""
    snapshot = {}
    for root, dirs, files in os.walk(base_dir):
        # Exclude ignored directories
        dirs[:] = [d for d in dirs if d not in IGNORE_DIRS and not d.startswith('.')]
        for file in files:
            if file in IGNORE_FILES:
                continue
            ext = os.path.splitext(file)[1].lower()
            if ext in WATCH_EXTENSIONS:
                full_path = os.path.join(root, file)
                try:
                    snapshot[full_path] = os.path.getmtime(full_path)
                except OSError:
                    pass
    return snapshot


def watch_files(base_dir):
    """Background thread watching for file changes."""
    prev_snapshot = get_files_snapshot(base_dir)
    print(f"[DevServer] Watching {len(prev_snapshot)} files for changes...")

    while not shutdown_event.is_set():
        time.sleep(0.5)
        current_snapshot = get_files_snapshot(base_dir)

        changed = False
        # Check modified or deleted files
        for path, prev_mtime in prev_snapshot.items():
            if path not in current_snapshot or current_snapshot[path] > prev_mtime:
                changed = True
                rel_path = os.path.relpath(path, base_dir)
                print(f"[DevServer] Change detected: {rel_path}")
                break

        # Check newly created files
        if not changed:
            for path in current_snapshot:
                if path not in prev_snapshot:
                    changed = True
                    rel_path = os.path.relpath(path, base_dir)
                    print(f"[DevServer] New file detected: {rel_path}")
                    break

        if changed:
            prev_snapshot = current_snapshot
            with subscribers_lock:
                for q in subscribers:
                    q.put('reload')


def find_available_port(start_port=8000, max_attempts=20):
    import socket
    for port in range(start_port, start_port + max_attempts):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(('127.0.0.1', port)) != 0:
                return port
    return start_port


def main():
    root_dir = pathlib.Path(__file__).parent.resolve()
    os.chdir(root_dir)

    requested_port = PORT
    for i, arg in enumerate(sys.argv[1:]):
        if arg.isdigit():
            requested_port = int(arg)
            break
        elif arg in ('--port', '-p') and i + 1 < len(sys.argv[1:]):
            val = sys.argv[1:][i + 1]
            if val.isdigit():
                requested_port = int(val)
                break
        elif arg.startswith('--port='):
            val = arg.split('=', 1)[1]
            if val.isdigit():
                requested_port = int(val)
                break

    port = find_available_port(requested_port)
    server_address = ('', port)

    httpd = ThreadingHTTPServer(server_address, DevServerHandler)

    watcher_thread = threading.Thread(target=watch_files, args=(str(root_dir),), daemon=True)
    watcher_thread.start()

    url = f"http://localhost:{port}"
    print("=" * 60, flush=True)
    print(f"  Personal Dictionary Development Server Running", flush=True)
    print(f"  Local URL:    {url}", flush=True)
    print(f"  Auto-reload:  ENABLED (watching HTML, CSS, JS, JSON)", flush=True)
    print(f"  Press Ctrl+C to stop the server", flush=True)
    print("=" * 60, flush=True)

    # Automatically open the browser unless --no-browser is passed
    if '--no-browser' not in sys.argv:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[DevServer] Shutting down...")
    finally:
        shutdown_event.set()
        httpd.server_close()
        print("[DevServer] Stopped.")


if __name__ == '__main__':
    main()
