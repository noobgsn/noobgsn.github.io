/**
 * noobgsn automation backend (Google Apps Script)
 * Setup:
 *   1) Open a Google Sheet, go to Extensions > Apps Script, and paste this file.
 *   2) Change ADMIN_KEY below. Only you can see this file.
 *   3) Deploy > New deployment > Web app. Execute as: Me. Who has access: Anyone.
 *   4) Copy the /exec URL into config.json on your website.
 * After you edit this file later: Deploy > Manage deployments > Edit > New version.
 * Any new extension, app, or bot only needs to call verify:
 *   {action:"verify", app:"<automation id>", code:"GSN-...", deviceId:"<device id>"}
 */
const ADMIN_KEY = 'CHANGE-THIS-TO-A-LONG-PASSWORD';
const AH = ['id', 'name', 'status', 'fileName', 'fileUrl', 'updatedAt', 'type', 'version', 'fileId', 'hash'];
const KH = ['code', 'automationId', 'status', 'deviceId', 'userLabel', 'createdAt', 'activatedAt', 'maxDevices', 'days', 'expiresAt', 'lastSeen'];

function sh_(n, h) {
  const ss = SpreadsheetApp.getActive(); let s = ss.getSheetByName(n); if (!s) s = ss.insertSheet(n);
  const r = s.getRange(1, 1, 1, h.length);
  if (r.getValues()[0].join('|') !== h.join('|')) r.setValues([h]);
  return s;
}
function load_(n, h) {
  const v = sh_(n, h).getDataRange().getValues(); v.shift();
  return v.filter(r => r[0] !== '').map(r => { const o = {}; h.forEach((k, i) => o[k] = r[i] instanceof Date ? r[i].toISOString() : String(r[i])); return o; });
}
function save_(n, h, list) {
  const s = sh_(n, h); s.clearContents();
  s.getRange(1, 1, list.length + 1, h.length).setValues([h].concat(list.map(o => h.map(k => o[k] == null ? '' : o[k]))));
}
const err_ = m => ({ ok: false, error: m });
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function doGet(e) { return out_(run_(e.parameter || {}, false)); }
function doPost(e) { let p = {}; try { p = JSON.parse(e.postData.contents); } catch (x) {} return out_(run_(p, true)); }

function code_() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', u = Utilities.getUuid().replace(/-/g, ''); let s = '';
  for (let i = 0; i < 12; i++) s += A[parseInt(u.substr(i * 2, 2), 16) % 32];
  return 'GSN-' + s.slice(0, 4) + '-' + s.slice(4, 8) + '-' + s.slice(8);
}
function slug_(name, A) {
  const b = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'app'; let s = b, i = 2;
  while (A.some(r => r.id === s)) s = b + '-' + i++; return s;
}
function hex_(b) { return b.map(x => ('0' + (x & 255).toString(16)).slice(-2)).join(''); }
function trash_(id) { try { if (id) DriveApp.getFileById(id).setTrashed(true); } catch (e) {} }
function state_() { return { ok: true, automations: load_('automations', AH), keys: load_('keys', KH) }; }
function pub_(r) { return { id: r.id, name: r.name, type: r.type, status: r.status, version: r.version, fileName: r.fileName, fileUrl: r.fileUrl }; }

function verify_(p, now) {
  const code = String(p.code || '').trim().toUpperCase(), dev = String(p.deviceId || '').trim().replace(/,/g, '').slice(0, 80);
  if (!code || !dev) return err_('missing');
  const K = load_('keys', KH), k = K.find(r => r.code === code);
  if (!k) { Utilities.sleep(1000); return err_('invalid'); }
  if (p.app && p.app !== k.automationId) return err_('wrong_app');
  if (k.status === 'blocked') return err_('blocked');
  const au = load_('automations', AH).find(r => r.id === k.automationId);
  if (!au || au.status !== 'running') return err_('stopped');
  if (k.expiresAt && Date.now() > Date.parse(k.expiresAt)) return err_('expired');
  const list = k.deviceId ? k.deviceId.split(',') : [], max = +k.maxDevices || 1; let dirty = false;
  if (list.indexOf(dev) < 0) {
    if (list.length >= max) return err_('device');
    list.push(dev); k.deviceId = list.join(','); k.status = 'active'; dirty = true;
    if (!k.activatedAt) { k.activatedAt = now; if (+k.days > 0) k.expiresAt = new Date(Date.now() + k.days * 864e5).toISOString(); }
  }
  if (!k.lastSeen || Date.now() - Date.parse(k.lastSeen) > 600000) { k.lastSeen = now; dirty = true; }
  if (dirty) save_('keys', KH, K);
  return { ok: true, name: au.name, version: +au.version || 1, expiresAt: k.expiresAt || '', devices: { used: list.length, max: max } };
}

function run_(p, post) {
  const lock = LockService.getScriptLock(); lock.waitLock(25000);
  try {
    const a = p.action, now = new Date().toISOString();
    if (a === 'list') return { ok: true, automations: load_('automations', AH).map(pub_) };
    if (a === 'verify') return verify_(p, now);
    if (!post || p.adminKey !== ADMIN_KEY) { Utilities.sleep(1500); return err_('Wrong admin key'); }
    const A = load_('automations', AH), K = load_('keys', KH), props = PropertiesService.getScriptProperties();

    if (a === 'admin_state') {
      if (!props.getProperty('seeded')) {
        props.setProperty('seeded', '1');
        if (!A.length) { A.push({ id: 'wallet-pro', name: 'Wallet pro', status: 'running', fileName: '', fileUrl: '', updatedAt: now, type: 'app', version: 1, fileId: '', hash: '' }); save_('automations', AH, A); }
      }
      return state_();
    }
    if (a === 'toggle_automation') {
      const x = A.find(r => r.id === p.automationId);
      if (x) { x.status = p.status === 'running' ? 'running' : 'stopped'; x.updatedAt = now; save_('automations', AH, A); }
      return state_();
    }
    if (a === 'delete_automation') {
      const x = A.find(r => r.id === p.automationId); if (x) trash_(x.fileId);
      save_('automations', AH, A.filter(r => r.id !== p.automationId));
      save_('keys', KH, K.filter(r => r.automationId !== p.automationId));
      return state_();
    }
    if (a === 'save_automation') {
      const name = String(p.name || '').trim().slice(0, 60); if (!name) return err_('Name is required.');
      const type = ['extension', 'app', 'bot'].indexOf(p.type) >= 0 ? p.type : 'app';
      const ex = A.find(r => r.name.toLowerCase() === name.toLowerCase());
      if (!p.fileData) {
        if (ex) return err_('"' + ex.name + '" already exists. Choose a file to upload a new version.');
        A.push({ id: slug_(name, A), name: name, status: 'running', fileName: '', fileUrl: '', updatedAt: now, type: type, version: 1, fileId: '', hash: '' });
        save_('automations', AH, A); return state_();
      }
      const m = /^data:([^;]*);base64,([\s\S]*)$/.exec(String(p.fileData));
      if (!m) return err_('Invalid file.');
      const bytes = Utilities.base64Decode(m[2]), hash = hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes));
      const dup = A.find(r => r.hash === hash);
      if (dup) return err_(dup === ex ? 'This exact file is already the current version.' : 'This file is already uploaded in "' + dup.name + '".');
      const fname = String(p.fileName || 'file').slice(0, 120);
      const it = DriveApp.getFoldersByName('noobgsn-automations'), fo = it.hasNext() ? it.next() : DriveApp.createFolder('noobgsn-automations');
      const f = fo.createFile(Utilities.newBlob(bytes, m[1] || 'application/octet-stream', fname));
      f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      const url = 'https://drive.google.com/uc?export=download&id=' + f.getId();
      if (ex) {
        trash_(ex.fileId);
        ex.version = ex.hash ? (+ex.version || 1) + 1 : (+ex.version || 1);
        ex.fileName = fname; ex.fileUrl = url; ex.fileId = f.getId(); ex.hash = hash; ex.updatedAt = now;
      } else A.push({ id: slug_(name, A), name: name, status: 'running', fileName: fname, fileUrl: url, updatedAt: now, type: type, version: 1, fileId: f.getId(), hash: hash });
      save_('automations', AH, A); return state_();
    }
    if (a === 'genkey') {
      if (!A.some(r => r.id === p.automationId)) return err_('Automation not found.');
      const c = code_(), md = Math.min(5, Math.max(1, +p.devices || 1)), dy = [7, 30, 90, 365].indexOf(+p.days) >= 0 ? +p.days : 0;
      K.unshift({ code: c, automationId: p.automationId, status: 'unused', deviceId: '', userLabel: String(p.userLabel || 'User').slice(0, 60), createdAt: now, activatedAt: '', maxDevices: md, days: dy, expiresAt: '', lastSeen: '' });
      save_('keys', KH, K); const s = state_(); s.code = c; return s;
    }
    if (a === 'key_action') {
      const k = K.find(r => r.code === p.code);
      if (k) {
        const s = p.subAction;
        if (s === 'block') k.status = 'blocked';
        else if (s === 'unblock') k.status = k.deviceId ? 'active' : 'unused';
        else if (s === 'reset') { k.status = 'unused'; k.deviceId = ''; }
        if (s === 'delete') K.splice(K.indexOf(k), 1);
        save_('keys', KH, K);
      }
      return state_();
    }
    return err_('Unknown action.');
  } finally { lock.releaseLock(); }
}
