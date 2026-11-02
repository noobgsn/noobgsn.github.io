"""noobgsn connect: adds access-code protection to any Python app or Telegram bot.
   curl -O https://noobgsn.com/connect.py
   import connect
   r = connect.check("app-id", code)                 # this machine counts as the device
   r = connect.check("app-id", code, str(user_id))   # Telegram bot: each user takes one device slot
   if not r["ok"]: print(r["message"])
"""
import json, os, uuid, urllib.request

CONFIG = "https://noobgsn.com/config.json"
MSG = {"invalid": "Invalid code.", "blocked": "This code is blocked.", "stopped": "This automation has been stopped by the admin.",
       "device": "This code is already in use on another device.", "expired": "This code has expired.",
       "wrong_app": "This code is for a different app.", "missing": "Code is required.",
       "network": "Could not reach the server. Please try again."}
_api = None

def _device():
    p = os.path.join(os.path.expanduser("~"), ".ngsn_device")
    try:
        d = open(p).read().strip()
        if d: return d
    except Exception:
        pass
    d = "d-" + uuid.uuid4().hex[:20]
    try: open(p, "w").write(d)
    except Exception: pass
    return d

def _url(api):
    global _api
    if api: return api
    if not _api:
        with urllib.request.urlopen(urllib.request.Request(CONFIG, headers={"Cache-Control": "no-cache"}), timeout=15) as r:
            _api = json.load(r)["api"]
    return _api

def check(app, code, device=None, api=None):
    """Never raises an exception. Returns a dict with ok and message and, on success, name, version, expiresAt, and devices."""
    try:
        body = json.dumps({"action": "verify", "app": app, "code": str(code or "").strip(), "deviceId": str(device or _device())}).encode()
        rq = urllib.request.Request(_url(api), data=body, headers={"Content-Type": "text/plain;charset=utf-8"})
        with urllib.request.urlopen(rq, timeout=20) as r: j = json.load(r)
        j["message"] = "OK" if j.get("ok") else MSG.get(j.get("error"), "Access denied.")
        return j
    except Exception:
        return {"ok": False, "error": "network", "message": MSG["network"]}
