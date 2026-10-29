#!/usr/bin/env python3
"""noobgsn runner. Runs automation projects for people who hold a valid access code.
KEEP THIS FILE PRIVATE. Run:  python runner.py --tunnel     (needs cloudflared for --tunnel)
Anyone with a code can run code on THIS machine: use a VM or a spare PC."""
import os, sys, json, time, base64, hashlib, shutil, zipfile, threading, subprocess, signal, re, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SALT = base64.b64decode("KRJo8GeBfVU6eq8BR7uEUg==")
SITE_URL = "https://noobgsn.com/"   # codes are read from your live index.html
PORT = 8787
ORIGINS = {"https://noobgsn.com", "https://www.noobgsn.com", "https://noobgsn.github.io", "http://localhost", "http://127.0.0.1"}
MAX_PER_CODE = 3
MAX_BYTES = 8 * 1024 * 1024
HERE = os.path.dirname(os.path.abspath(__file__))
BASE = os.path.join(HERE, "projects"); os.makedirs(BASE, exist_ok=True)
LOCK = threading.Lock(); PROCS = {}; _codes = {"t": 0, "v": set()}; _ok = {}; _fail = {}

def parse(text):
    m = re.search(r"/\*CODES\*/(.*?)/\*END\*/", text, re.S)
    return json.loads(m.group(1)) if m else None

def codes():
    if time.time() - _codes["t"] < 30: return _codes["v"]
    data = None
    try:
        rq = urllib.request.Request(SITE_URL + "?t=%d" % time.time(), headers={"User-Agent": "runner"})
        with urllib.request.urlopen(rq, timeout=10) as r: data = parse(r.read().decode("utf-8", "replace"))
    except Exception: pass
    if data is None:
        p = os.path.join(HERE, "index.html")
        if os.path.exists(p): data = parse(open(p, encoding="utf-8").read())
    if isinstance(data, list):
        _codes["v"] = {e.get("v") for e in data if isinstance(e, dict)}; _codes["t"] = time.time()
    return _codes["v"]

def verify(code, ip):
    code = (code or "").strip().upper(); now = time.time()
    f = [t for t in _fail.get(ip, []) if now - t < 60]
    if len(f) >= 10 or not code: return None
    if code in _ok and now - _ok[code] < 60: return code
    k = hashlib.pbkdf2_hmac("sha256", code.encode(), SALT, 200000, 32)
    if hashlib.sha256(b"auth" + k).hexdigest() in codes():
        _ok[code] = now; return code
    f.append(now); _fail[ip] = f
    return None

def find_entry(d):
    best = None
    for root, _, files in os.walk(d):
        for fn in files:
            if fn in ("main.py", "app.py", "run.py", "start.py", "bot.py"):
                depth = root[len(d):].count(os.sep)
                if best is None or depth < best[0]: best = (depth, os.path.join(root, fn))
    if best: return best[1]
    pys = [os.path.join(r, f) for r, _, fs in os.walk(d) for f in fs if f.endswith(".py")]
    if len(pys) == 1: return pys[0]
    raise ValueError("Entry file not found (name it main.py)")

def launch(info, entry):
    cwd = os.path.dirname(entry)
    env = {k: os.environ[k] for k in ("PATH", "SYSTEMROOT", "TEMP", "TMP", "USERPROFILE", "HOME", "APPDATA", "LOCALAPPDATA", "LANG") if k in os.environ}
    env["PYTHONUNBUFFERED"] = "1"
    log = open(info["log"], "ab")
    try:
        req = os.path.join(cwd, "requirements.txt")
        if os.path.exists(req):
            subprocess.run([sys.executable, "-m", "pip", "install", "-r", req, "-q"], cwd=cwd, env=env, stdout=log, stderr=subprocess.STDOUT, timeout=600)
        if info["state"] == "stopped": return
        kw = {"creationflags": 0x00000200} if os.name == "nt" else {"start_new_session": True}
        p = subprocess.Popen([sys.executable, "-u", entry], cwd=cwd, env=env, stdout=log, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL, **kw)
        info["proc"] = p; info["state"] = "running"
        info["exit"] = p.wait()
        if info["state"] != "stopped": info["state"] = "exited"
    except Exception as e:
        log.write(("runner error: %s\n" % e).encode()); info["state"] = "exited"; info["exit"] = -1

def start(owner, name, fname, b64):
    key = (owner, name)
    with LOCK:
        cur = PROCS.get(key)
        if cur and cur["state"] in ("running", "installing"): raise ValueError("Already running. Stop it first.")
        if sum(1 for (o, _), p in PROCS.items() if o == owner and p["state"] in ("running", "installing")) >= MAX_PER_CODE:
            raise ValueError("Too many running projects for this code")
        raw = base64.b64decode(b64 or "")
        if not raw or len(raw) > MAX_BYTES: raise ValueError("File missing or too large")
        d = os.path.join(BASE, owner, name)
        shutil.rmtree(d, ignore_errors=True); os.makedirs(d)
        ext = os.path.splitext(fname)[1].lower()
        if ext == ".py": open(os.path.join(d, "main.py"), "wb").write(raw)
        elif ext == ".zip":
            zp = os.path.join(d, "_u.zip"); open(zp, "wb").write(raw)
            with zipfile.ZipFile(zp) as z:
                for m in z.namelist():
                    if not os.path.realpath(os.path.join(d, m)).startswith(os.path.realpath(d) + os.sep): raise ValueError("Bad zip")
                z.extractall(d)
            os.remove(zp)
        else: raise ValueError("Only .py or .zip files")
        entry = find_entry(d)
        info = {"state": "installing", "exit": None, "proc": None, "log": os.path.join(d, "_run.log")}
        PROCS[key] = info
    threading.Thread(target=launch, args=(info, entry), daemon=True).start()

def stop(owner, name):
    info = PROCS.get((owner, name))
    if not info or info["state"] not in ("running", "installing"): raise ValueError("Not running")
    info["state"] = "stopped"; p = info.get("proc")
    if p and p.poll() is None:
        if os.name == "nt": subprocess.run(["taskkill", "/T", "/F", "/PID", str(p.pid)], capture_output=True)
        else:
            try: os.killpg(os.getpgid(p.pid), signal.SIGTERM)
            except Exception: p.terminate()

def status(owner, name):
    info = PROCS.get((owner, name))
    if not info: return {"state": "idle", "log": []}
    try: lines = open(info["log"], "rb").read()[-6000:].decode("utf-8", "replace").splitlines()[-30:]
    except Exception: lines = []
    return {"state": info["state"], "exit": info["exit"], "log": lines}

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def cors(self):
        o = self.headers.get("Origin", "")
        if o in ORIGINS: self.send_header("Access-Control-Allow-Origin", o); self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Access, ngrok-skip-browser-warning")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    def out(self, c, obj):
        b = json.dumps(obj).encode()
        self.send_response(c); self.cors(); self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)
    def do_OPTIONS(self): self.send_response(204); self.cors(); self.end_headers()
    def do_GET(self): self.out(200, {"ok": True}) if self.path.startswith("/ping") else self.out(404, {"error": "not found"})
    def do_POST(self):
        ip = self.headers.get("CF-Connecting-IP") or self.headers.get("X-Forwarded-For", "").split(",")[-1].strip() or self.client_address[0]
        code = verify(self.headers.get("X-Access"), ip)
        if not code: return self.out(401, {"error": "Invalid or expired code"})
        try:
            n = int(self.headers.get("Content-Length", "0"))
            if n > MAX_BYTES * 2: return self.out(413, {"error": "Too large"})
            body = json.loads(self.rfile.read(n) or b"{}"); name = str(body.get("project", ""))
            if not re.fullmatch(r"[A-Za-z0-9_-]{1,32}", name): return self.out(400, {"error": "Project name: letters, numbers, - _ (max 32)"})
            owner = hashlib.sha256(code.encode()).hexdigest()[:10]
            if self.path == "/start": start(owner, name, str(body.get("name", "")), body.get("data", "")); return self.out(200, {"ok": True})
            if self.path == "/stop": stop(owner, name); return self.out(200, {"ok": True})
            if self.path == "/status": return self.out(200, status(owner, name))
            self.out(404, {"error": "not found"})
        except ValueError as e: self.out(400, {"error": str(e)})
        except Exception: self.out(500, {"error": "Runner error"})

def tunnel():
    exe = shutil.which("cloudflared")
    if not exe: print("cloudflared not found. Install it, or use: ngrok http %d" % PORT); return
    p = subprocess.Popen([exe, "tunnel", "--url", "http://localhost:%d" % PORT], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    for line in p.stdout:
        m = re.search(r"https://[a-z0-9-]+\.trycloudflare\.com", line)
        if m:
            print("\nPUBLIC URL:", m.group(0)); print('Put this in runner.json:  {"url": "%s"}\n' % m.group(0)); break
    for _ in p.stdout: pass

if __name__ == "__main__":
    print("Runner listening on http://127.0.0.1:%d" % PORT)
    if "--tunnel" in sys.argv: threading.Thread(target=tunnel, daemon=True).start()
    ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
