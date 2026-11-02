/* noobgsn connect: adds access-code protection to any extension, web app, or Node app.
   Usage:  const r = await NGSN.check("app-id", code);  if (!r.ok) { alert(r.message); }
   Extensions (MV3): copy this file into your extension, and add https://noobgsn.com/*, https://script.google.com/*,
   and https://script.googleusercontent.com/* to host_permissions.
   Optional third argument: { device: "id", api: "https://.../exec" } */
(function (g) {
  var CFG = "https://noobgsn.com/config.json", api0 = null;
  var MSG = { invalid: "Invalid code.", blocked: "This code is blocked.", stopped: "This automation has been stopped by the admin.",
    device: "This code is already in use on another device.", expired: "This code has expired.", wrong_app: "This code is for a different app.",
    missing: "Code is required.", network: "Could not reach the server. Please try again." };
  var isNode = typeof process !== "undefined" && process.versions && process.versions.node;
  function rid() {
    var a = new Uint8Array(12);
    if (g.crypto && g.crypto.getRandomValues) g.crypto.getRandomValues(a); else require("crypto").randomFillSync(a);
    return Array.from(a, function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
  }
  async function get(k) {
    if (g.chrome && g.chrome.storage && g.chrome.storage.local) return new Promise(function (r) { g.chrome.storage.local.get(k, function (o) { r(o[k]); }); });
    if (isNode) { try { return require("fs").readFileSync(require("path").join(process.cwd(), ".ngsn_device"), "utf8").trim(); } catch (e) { return null; } }
    try { return g.localStorage.getItem(k); } catch (e) { return null; }
  }
  async function set(k, v) {
    if (g.chrome && g.chrome.storage && g.chrome.storage.local) { var o = {}; o[k] = v; return new Promise(function (r) { g.chrome.storage.local.set(o, r); }); }
    if (isNode) { try { require("fs").writeFileSync(require("path").join(process.cwd(), ".ngsn_device"), v); } catch (e) {} return; }
    try { g.localStorage.setItem(k, v); } catch (e) {}
  }
  async function device() { var d = await get("ngsn_device"); if (!d) { d = "d-" + rid(); await set("ngsn_device", d); } return d; }
  async function api(o) {
    if (o.api) return o.api; if (api0) return api0;
    var j = await (await fetch(CFG, { cache: "no-store" })).json(); return (api0 = j.api);
  }
  async function check(app, code, o) {
    o = o || {};
    try {
      var u = await api(o), dev = o.device || await device();
      var r = await fetch(u, { method: "POST", redirect: "follow", headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "verify", app: app, code: String(code || "").trim(), deviceId: dev }) });
      var j = await r.json(); j.message = j.ok ? "OK" : (MSG[j.error] || "Access denied."); return j;
    } catch (e) { return { ok: false, error: "network", message: MSG.network }; }
  }
  var out = { check: check, device: device }; g.NGSN = out; if (typeof module !== "undefined") module.exports = out;
})(typeof globalThis !== "undefined" ? globalThis : this);
