/* =====================================================================
   คุมงานก่อสร้าง (PWA) — ใช้งานคนเดียว ข้อมูลเก็บในเครื่อง (IndexedDB)
   ===================================================================== */
'use strict';
var APP_VERSION = '2.3.0';

/* ---------------- IndexedDB ---------------- */
var DB_NAME = 'sitecontrol', DB_VER = 3;
var STORES = ['projects', 'tasks', 'progress', 'daily', 'weekly', 'submittals', 'files', 'meta', 'installments', 'vos', 'eots'];
var _db = null;
function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise(function (res, rej) {
    var r = indexedDB.open(DB_NAME, DB_VER);
    r.onupgradeneeded = function () {
      var db = r.result;
      STORES.forEach(function (s) {
        if (db.objectStoreNames.contains(s)) return;
        var os = db.createObjectStore(s, { keyPath: s === 'meta' ? 'key' : 'id' });
        if (s !== 'projects' && s !== 'meta') os.createIndex('projectId', 'projectId');
      });
      if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'k' }); // คิวรอซิงก์
    };
    r.onsuccess = function () { _db = r.result; res(_db); };
    r.onerror = function () { rej(r.error); };
    r.onblocked = function () { rej(new Error('ฐานข้อมูลถูกใช้งานในแท็บอื่น กรุณาปิดแท็บอื่นของแอปก่อน')); };
  });
}
function tx(store, mode, fn) {
  return openDB().then(function (db) {
    return new Promise(function (res, rej) {
      var t = db.transaction(store, mode), os = t.objectStore(store), out;
      var r = fn(os); if (r) r.onsuccess = function () { out = r.result; };
      t.oncomplete = function () { res(out); };
      t.onerror = function () { rej(t.error); }; t.onabort = function () { rej(t.error || new Error('ยกเลิกการบันทึก')); };
    });
  });
}
var DB = {
  get: function (s, id) { return tx(s, 'readonly', function (os) { return os.get(id); }); },
  put: function (s, o) { return tx(s, 'readwrite', function (os) { return os.put(o); }).then(function () { return o; }); },
  del: function (s, id) { return tx(s, 'readwrite', function (os) { return os.delete(id); }); },
  all: function (s) { return tx(s, 'readonly', function (os) { return os.getAll(); }); },
  byProject: function (s, pid) { return tx(s, 'readonly', function (os) { return os.index('projectId').getAll(pid); }); },
  putMany: function (s, arr) { return tx(s, 'readwrite', function (os) { arr.forEach(function (o) { os.put(o); }); }); },
  delMany: function (s, ids) { return tx(s, 'readwrite', function (os) { ids.forEach(function (id) { os.delete(id); }); }); },
  clear: function (s) { return tx(s, 'readwrite', function (os) { return os.clear(); }); }
};
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function meta(key, val) {
  if (val === undefined) return DB.get('meta', key).then(function (r) { return r ? r.value : null; });
  return DB.put('meta', { key: key, value: val });
}

/* ---------------- utilities ---------------- */
function $(s, r) { return (r || document).querySelector(s); }
function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(/,/g, '')); return isNaN(n) ? 0 : n; }
function D(s) { if (!s) return null; var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
function iso(d) { if (!d) return ''; var m = d.getMonth() + 1, x = d.getDate(); return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (x < 10 ? '0' : '') + x; }
function addDays(d, n) { var x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }
function diffDays(a, b) { return Math.round((a - b) / 86400000); }
function today() { var t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate()); }
var TM = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
var TMS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
var TDAY = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
function th(d, short) { if (typeof d === 'string') d = D(d); if (!d) return '-'; return d.getDate() + ' ' + (short ? TMS : TM)[d.getMonth()] + ' ' + (short ? String(d.getFullYear() + 543).slice(-2) : d.getFullYear() + 543); }
function pct(v, dp) { return (v * 100).toFixed(dp == null ? 2 : dp) + '%'; }
function money(v) { return num(v).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function jparse(s, d) { try { return JSON.parse(s); } catch (e) { return d; } }
function toast(msg, err, ms) {
  $$('.toast').forEach(function (x) { x.remove(); });
  var t = document.createElement('div'); t.className = 'toast' + (err ? ' err' : ''); t.setAttribute('role', 'status'); t.textContent = msg;
  document.body.appendChild(t); setTimeout(function () { t.remove(); }, ms || 3000);
}
function badge(o) { return '<span class="badge b-' + o.k + '">' + esc(o.t) + '</span>'; }
function parseDateAny(s) {
  s = String(s || '').trim(); if (!s) return '';
  var m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s); if (m) { var y = +m[1]; if (y > 2400) y -= 543; return iso(new Date(y, +m[2] - 1, +m[3])); }
  m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/.exec(s);
  if (m) { var yy = +m[3]; if (yy < 100) yy += yy > 50 ? 2500 : 2000; if (yy > 2400) yy -= 543; return iso(new Date(yy, +m[2] - 1, +m[1])); }
  m = /^(\d{1,2})[\s\-]([A-Za-z]{3})[a-z]*[\s\-](\d{2,4})$/.exec(s);
  if (m) { var mi = 'janfebmaraprmayjunjulaugsepoctnovdec'.indexOf(m[2].toLowerCase()) / 3, y2 = +m[3]; if (y2 < 100) y2 += y2 > 50 ? 1957 : 2000; if (y2 > 2400) y2 -= 543; if (mi >= 0) return iso(new Date(y2, mi, +m[1])); }
  return 'X';
}

/* ---------------- state ---------------- */
var S = { projects: [], P: null, tasks: [], progress: [], daily: [], weekly: [], submittals: [], files: [], installments: [], vos: [], eots: [], route: [], urls: {}, deferredInstall: null, finTab: 'inst' };

/* ---------------- calculations (ยกมาจากเว็บแอปที่ทดสอบแล้ว) ---------------- */
function parts() { return (S.P && S.P.parts) || []; }
function cats() { return (S.P && S.P.cats) || []; }
function projStart() { return D(S.P.start) || today(); }
function projDur() { return Math.max(1, num(S.P.duration)); }
function eotApproved(eots) { return (eots || S.eots || []).reduce(function (a, e) { return a + (e.status === 'อนุมัติ' || e.status === 'อนุมัติบางส่วน' ? num(e.days_approved) : 0); }, 0); }
function eotTotal(eots) { return eotApproved(eots) + num(S.P.eot_days); }
function projEnd(eots) { return addDays(projStart(), projDur() + eotTotal(eots) - 1); }
function voNet(vos) { return (vos || S.vos || []).reduce(function (a, v) { if (v.status !== 'อนุมัติ') return a; var x = v.approved_amount !== '' && v.approved_amount != null ? num(v.approved_amount) : num(v.amount); return a + (v.type === 'งานลด' ? -x : x); }, 0); }
var K_DEFAULT = { a: 0.25, c: [0.15, 0.10, 0.40, 0.10, 0], io: [100, 100, 100, 100, 0], n: ['I ดัชนีราคาผู้บริโภค', 'C ดัชนีราคาซีเมนต์', 'M ดัชนีราคาวัสดุก่อสร้าง', 'S ดัชนีราคาเหล็ก', ''] };
function fin() { var f = S.P.fin || {}; return { adv: f.adv != null ? num(f.adv) : 15, ret: f.ret != null ? num(f.ret) : 5, kUse: !!f.kUse, kThr: f.kThr != null ? num(f.kThr) : 4, k: f.k || K_DEFAULT,
  ldRate: f.ldRate != null ? num(f.ldRate) : 0.10, ldMin: f.ldMin != null ? num(f.ldMin) : 100, ldCap: f.ldCap != null ? num(f.ldCap) : 10 }; }
function kOf(inst) {
  var F = fin(); if (!F.kUse) return null; var k = F.k, it = inst.it || [], K = num(k.a), used = 0;
  for (var i = 0; i < 5; i++) { if (num(k.c[i]) > 0) { if (!num(it[i]) || !num(k.io[i])) return null; K += num(k.c[i]) * num(it[i]) / num(k.io[i]); used++; } }
  return used ? K : null;
}
function payOf(inst) {
  var F = fin(), amt = num(inst.amount) + num(inst.vo_amount), K = kOf(inst), thr = F.kThr / 100, kadj = 0;
  if (K != null) kadj = K > 1 + thr ? amt * (K - 1 - thr) : K < 1 - thr ? amt * (K - 1 + thr) : 0;
  var adv = amt * F.adv / 100, ret = amt * F.ret / 100, ld = num(inst.ld);
  return { amt: amt, K: K, kadj: kadj, adv: adv, ret: ret, ld: ld, net: amt + kadj - adv - ret - ld };
}
function instStatus(i) {
  var d = today(), due = D(i.due);
  if (i.accepted) return { k: 'ok', t: 'ตรวจรับแล้ว' };
  if (i.submitted) return { k: 'warn', t: 'ส่งมอบแล้ว รอตรวจรับ' };
  if (!due) return { k: 'na', t: '-' };
  if (d > due) return { k: 'bad', t: 'เกินกำหนด ' + diffDays(d, due) + ' วัน' };
  if (diffDays(due, d) <= 14) return { k: 'warn', t: 'ใกล้ครบกำหนด (' + diffDays(due, d) + ' วัน)' };
  return { k: 'na', t: 'ยังไม่ถึงกำหนด' };
}
function ldInfo() {
  var F = fin(), d = today(), per = Math.max(F.ldMin, F.ldRate / 100 * num(S.P.bac)), end = projEnd();
  // คาดการณ์วันแล้วเสร็จด้วยวิธี Earned Schedule (แบบเดียวกับ Dashboard ใน Excel v4):
  // ES = วันที่ตามแผนที่มีผลงานเท่ากับผลงานจริง • SPI(t) = ES / AT • วันแล้วเสร็จ = วันเริ่ม + ระยะเวลาสัญญา / SPI(t)
  var ac = actualNow(), st = projStart(), at = Math.max(1, diffDays(d, st) + 1), es = 0;
  if (ac > 0) { var hi = projDur() + eotTotal() + 400; for (var i = 0; i <= hi; i++) { if (planAt(addDays(st, i)) <= ac + 1e-12) es = i + 1; else break; } }
  var spit = es / at, fEnd = ac >= 1 ? d : (spit > 0 ? addDays(st, Math.round(projDur() / spit) - 1) : null);
  var late = Math.max(0, diffDays(d, end)), fDelay = fEnd ? Math.max(0, diffDays(fEnd, end)) : null;
  var fLd = fDelay == null ? null : fDelay * per, cap = F.ldCap / 100 * num(S.P.bac);
  return { per: per, late: late, incurred: late * per, fEnd: fEnd, fDelay: fDelay, fLd: fLd, overCap: fLd != null && cap > 0 && fLd > cap, es: es, spit: spit };
}
function weightFn(tasks) {
  tasks = tasks || S.tasks;
  var sb = tasks.reduce(function (a, t) { return a + num(t.boq); }, 0);
  return function (t) { return String(t.weight == null ? '' : t.weight).trim() !== '' && !isNaN(parseFloat(t.weight)) ? num(t.weight) / 100 : (sb ? num(t.boq) / sb : 0); };
}
function spanPct(s, f, d) { if (!s || !f) return 0; if (d >= f) return 1; if (d < s) return 0; return (diffDays(d, s) + 1) / (diffDays(f, s) + 1); }
function planAt(d, rev, tasks) {
  tasks = tasks || S.tasks; var w = weightFn(tasks);
  return tasks.reduce(function (a, t) { return a + w(t) * spanPct(D(rev && t.rs ? t.rs : t.bs), D(rev && t.rf ? t.rf : t.bf), d); }, 0);
}
function actualNow(tasks) { tasks = tasks || S.tasks; var w = weightFn(tasks); return tasks.reduce(function (a, t) { return a + w(t) * num(t.pct) / 100; }, 0); }
// ประวัติผลงาน: % ของรายการ ณ วันที่ d = บันทึกล่าสุดที่วันที่ ≤ d
function histIndex() {
  var m = {};
  S.progress.forEach(function (p) { (m[p.taskId] = m[p.taskId] || []).push(p); });
  Object.keys(m).forEach(function (k) { m[k].sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.ts || 0) - (b.ts || 0); }); });
  return m;
}
function taskPctAt(hist, taskId, dIso) { var a = hist[taskId], v = 0; if (!a) return 0; for (var i = 0; i < a.length && a[i].date <= dIso; i++) v = num(a[i].pct); return v; }
function actualAt(d, hist) {
  hist = hist || histIndex(); var w = weightFn(), di = iso(d);
  return S.tasks.reduce(function (a, t) { return a + w(t) * taskPctAt(hist, t.id, di) / 100; }, 0);
}
function weekRange(n) { var s = addDays(projStart(), 7 * (n - 1)); return { n: n, start: s, end: addDays(s, 6) }; }
function weekOf(d) { return Math.max(1, Math.floor(diffDays(d, projStart()) / 7) + 1); }
function lastFullWeek() { return Math.max(1, Math.floor((diffDays(today(), projStart()) + 1) / 7)); }
function totalWeeks() { return Math.max(1, Math.ceil((diffDays(projEnd(), projStart()) + 1) / 7)); }
function isMulti() { return S.P && S.P.type === 'multi'; }
function wbsList() {
  var P = parts(), C = cats(), seq = {};
  var rank = function (x, L) { var i = L.indexOf(x); return i < 0 ? 999 : i; };
  var sorted = S.tasks.map(function (t, i) { return { t: t, i: num(t.order) || i }; }).sort(function (a, b) {
    return (rank(a.t.part, P) - rank(b.t.part, P)) || (rank(a.t.cat, C) - rank(b.t.cat, C)) || (a.i - b.i); }).map(function (o) { return o.t; });
  return sorted.map(function (t) {
    var pi = P.indexOf(t.part) + 1, ci = C.indexOf(t.cat) + 1, k = pi + '.' + ci; seq[k] = (seq[k] || 0) + 1;
    var code = isMulti() ? (pi || '?') + '.' + (ci || '?') + '.' + (seq[k] < 10 ? '0' : '') + seq[k] : (ci || '?') + '.' + (seq[k] < 10 ? '0' : '') + seq[k];
    return { t: t, wbs: code };
  });
}
function wbsOf(id) { var x = wbsList().filter(function (o) { return o.t.id === id; })[0]; return x ? x.wbs : ''; }
function taskById(id) { return S.tasks.filter(function (t) { return t.id === id; })[0]; }
function taskStatus(t, d) {
  d = d || today(); var bs = D(t.bs), bf = D(t.bf), s = D(t.rs || t.bs), p = num(t.pct) / 100;
  if (!bs || !bf) return { k: 'na', t: '-' };
  if (t.af) return D(t.af) <= bf ? { k: 'ok', t: 'เสร็จ' } : { k: 'warn', t: 'เสร็จช้า' };
  if (!t.as && d < s) return { k: 'na', t: 'ยังไม่ถึงกำหนด' };
  if (p >= spanPct(bs, bf, d)) return { k: 'ok', t: 'ตามแผน' };
  return d > bf ? { k: 'bad', t: 'เกินกำหนด' } : { k: 'bad', t: 'ล่าช้า' };
}
function subRisk(s) {
  var t = taskById(s.taskId), d = today();
  if (s.status === 'อนุมัติ') return { k: 'ok', t: '✓ อนุมัติแล้ว' };
  if (!t) return { k: 'na', t: 'ไม่ได้ผูกกับรายการงาน' };
  var need = addDays(D(t.rs || t.bs), -num(s.lead_days)), left = diffDays(need, d);
  if (s.status === 'ไม่อนุมัติ') return { k: 'bad', t: '⚠ ไม่อนุมัติ – ต้องเสนอใหม่', need: need };
  if (left < 0) return { k: 'bad', t: '⚠ เลยกำหนดอนุมัติ ' + (-left) + ' วัน', need: need };
  if (left <= 14) return { k: 'warn', t: '⚠ ต้องอนุมัติภายใน ' + left + ' วัน', need: need };
  return { k: 'na', t: 'ติดตาม (เหลือ ' + left + ' วัน)', need: need };
}
function spiState(ac, pl) {
  if (ac >= 1) return { k: 'ok', t: 'แล้วเสร็จ' };
  if (!pl && !ac) return { k: 'na', t: 'ยังไม่เริ่ม' };
  if (pl > 0 && ac >= pl * 1.05 && ac - pl >= 0.01) return { k: 'ok', t: 'เร็วกว่าแผน' };
  if (ac >= pl - 0.005) return { k: 'ok', t: 'ตามแผน' }; // ต่างกันไม่เกิน 0.5% ถือว่าตามแผน
  return ac / pl >= 0.9 ? { k: 'warn', t: 'เฝ้าระวัง' } : { k: 'bad', t: 'ล่าช้า' };
}
// สรุปของโครงการ (ใช้ในหน้าหลัก โดยไม่ต้องสลับโครงการ)
function projectSummary(p, tasks) {
  var keep = S.P; S.P = p;
  try {
    var d = today(), pl = planAt(d, false, tasks), ac = actualNow(tasks);
    return { plan: pl, act: ac, st: spiState(ac, pl), end: projEnd(p._eots || []), n: tasks.length };
  } finally { S.P = keep; }
}

/* ---------------- icons (line icons) ---------------- */
var ICONS = {
  dash: '<path d="M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>',
  day: '<path d="M9 3h6v3H9zM7 4.5H5V21h14V4.5h-2M8 11h8M8 15h8M8 19h5"/>',
  week: '<path d="M4 6h16v15H4zM4 10h16M8 3v5M16 3v5M8 14h2M12 14h2M16 14h0M8 17h2M12 17h2"/>',
  box: '<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5zM3 7.5l9 4.5 9-4.5M12 12v9"/>',
  money: '<path d="M3 6h18v12H3zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5M6.5 9v6M17.5 9v6"/>',
  settings: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  home: '<path d="M3 11 12 4l9 7M5 10v10h14V10M10 20v-6h4v6"/>',
  print: '<path d="M7 8V3h10v5M5 8h14v8H5zM7 14h10v7H7z"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  upload: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  camera: '<path d="M4 8h4l2-3h4l2 3h4v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  spark: '<path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>',
  file: '<path d="M6 3h9l4 4v14H6zM15 3v4h4M9 12h6M9 16h6"/>',
  excel: '<path d="M6 3h9l4 4v14H6zM15 3v4h4M9 11l5 6M14 11l-5 6"/>',
  backup: '<path d="M4 6c0-2.5 16-2.5 16 0v12c0 2.5-16 2.5-16 0zM4 6c0 2.5 16 2.5 16 0M4 12c0 2.5 16 2.5 16 0"/>',
  archive: '<path d="M3 4h18v4H3zM5 8v12h14V8M10 12h4"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  edit: '<path d="M4 20h4L20 8l-4-4L4 16zM14 6l4 4"/>',
  chevl: '<path d="m15 5-7 7 7 7"/>', chevr: '<path d="m9 5 7 7-7 7"/>',
  alert: '<path d="M12 3 22 20H2zM12 10v4M12 17v.5"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  folder: '<path d="M3 6h7l2 2h9v11H3z"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>'
};
function ic(n) { return '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[n] || '') + '</svg>'; }
function pageHead(title, sub, actions) {
  var crumb = S.P ? '<a href="#/">โครงการทั้งหมด</a> › <a href="#/p/' + S.P.id + '">' + esc(S.P.name) + '</a>' : '<a href="#/">โครงการทั้งหมด</a>';
  return '<div class="phead"><div class="crumb">' + crumb + '</div><div class="between"><div><h1>' + title + '</h1>' + (sub ? '<p>' + sub + '</p>' : '') + '</div>' +
    (actions ? '<div class="row noprint">' + actions + '</div>' : '') + '</div></div>';
}
/* ---------------- routing & shell ---------------- */
function go(path) { if (location.hash !== '#' + path) location.hash = path; else render(); }
function parseRoute() { return (location.hash.replace(/^#\/?/, '') || '').split('/').filter(Boolean).map(decodeURIComponent); }
var NAV_P = [['dash', 'dash', 'ภาพรวมโครงการ', 'ภาพรวม'], ['tasks', 'list', 'แผนงานและผลงาน', 'ผลงาน'], ['daily', 'day', 'รายงานประจำวัน', 'รายวัน'], ['weekly', 'week', 'รายงานรายสัปดาห์', 'สัปดาห์'], ['mat', 'box', 'ขออนุมัติวัสดุ', 'วัสดุ'], ['fin', 'money', 'สัญญาและการเงิน', 'สัญญา']];
function renderNav() {
  var r = S.route, inP = r[0] === 'p' && S.P, cur = inP ? (r[2] || 'dash') : (r[0] || 'home');
  if (cur === 'print') cur = { mat: 'mat', pay: 'fin' }[r[3]] || r[3];
  var items = inP ? NAV_P.map(function (n) { return ['/p/' + S.P.id + (n[0] === 'dash' ? '' : '/' + n[0]), n[1], n[2], n[0], n[3]]; })
    : [['/', 'folder', 'โครงการทั้งหมด', 'home', 'โครงการ'], ['/app', 'settings', 'ตั้งค่าและสำรองข้อมูล', 'app', 'ตั้งค่า']];
  var btn = function (n, short) { return '<button data-go="' + esc(n[0]) + '" class="' + (cur === n[3] ? 'on' : '') + '"' + (cur === n[3] ? ' aria-current="page"' : '') + '>' + ic(n[1]) + '<span>' + esc(short ? n[4] || n[2] : n[2]) + '</span></button>'; };
  $('#bottomNav').innerHTML = items.map(function (n) { return btn(n, true); }).join('');
  $('#sideNav').innerHTML = (inP ? '<div class="grp">โครงการ</div>' : '<div class="grp">เมนู</div>') + items.map(function (n) { return btn(n); }).join('') +
    (inP ? '<div class="sep"></div>' + btn(['/p/' + S.P.id + '/set', 'settings', 'ตั้งค่าโครงการ', 'set']) + btn(['/', 'folder', 'โครงการทั้งหมด', 'home']) + btn(['/app', 'backup', 'ตั้งค่าและสำรองข้อมูล', 'app']) : '') +
    '<div class="foot">ระบบควบคุมงานก่อสร้าง v' + APP_VERSION + '</div>';
  $('#brandText').innerHTML = inP ? esc(S.P.name) + '<small>' + esc([S.P.contract_no ? 'สัญญาเลขที่ ' + S.P.contract_no : '', S.P.type === 'multi' ? 'โครงการหลายงานส่วน' : 'งานก่อสร้าง'].filter(Boolean).join(' • ')) + '</small>' : 'ระบบควบคุมงานก่อสร้าง<small>CONSTRUCTION SUPERVISION</small>';
  document.title = inP ? S.P.name + ' – ระบบควบคุมงานก่อสร้าง' : 'ระบบควบคุมงานก่อสร้าง';
}
var chart = null;
async function render() {
  S.route = parseRoute();
  var r = S.route, m = $('#main');
  if (chart) { chart.destroy(); chart = null; }
  try {
    if (r[0] === 'p') {
      if (!S.P || S.P.id !== r[1]) await loadProject(r[1]);
      if (!S.P) { go('/'); return; }
      var v = r[2] || 'dash';
      var views = { dash: vDash, tasks: vTasks, daily: vDaily, weekly: vWeekly, mat: vMat, fin: vFin, set: vProjSet, print: vPrint };
      renderNav();
      m.innerHTML = await (views[v] || vDash)(r.slice(3));
    } else {
      S.P = null; renderNav();
      m.innerHTML = r[0] === 'app' ? await vApp() : await vHome();
    }
  } catch (e) { console.error(e); m.innerHTML = '<div class="card"><h2>เกิดข้อผิดพลาด</h2><p>' + esc(e.message) + '</p><button class="btn" data-go="/">กลับหน้าหลัก</button></div>'; }
  afterRender();
}
var _after = [];
function after(fn) { _after.push(fn); }
function afterRender() { var q = _after; _after = []; q.forEach(function (f) { try { f(); } catch (e) { console.error(e); } }); hydrateImgs(); }
async function loadProject(id) {
  var p = await DB.get('projects', id); S.P = p || null; if (!p) return;
  var res = await Promise.all(['tasks', 'progress', 'daily', 'weekly', 'submittals', 'files', 'installments', 'vos', 'eots'].map(function (s) { return DB.byProject(s, id); }));
  S.tasks = res[0]; S.progress = res[1]; S.daily = res[2]; S.weekly = res[3]; S.submittals = res[4]; S.files = res[5]; S.installments = res[6]; S.vos = res[7]; S.eots = res[8];
  Object.keys(S.urls).forEach(function (k) { URL.revokeObjectURL(S.urls[k]); }); S.urls = {};
}
async function saveProject() { S.P.updated = new Date().toISOString(); await DB.put('projects', S.P); }

/* ---------------- modal ---------------- */
function modal(html, onOk, okText, wide) {
  var bg = document.createElement('div'); bg.className = 'mbg';
  bg.innerHTML = '<div class="modal' + (wide ? ' wide' : '') + '" role="dialog" aria-modal="true">' + html + '<div class="mfoot"><button class="btn sec" data-x>' + (onOk ? 'ยกเลิก' : 'ปิด') + '</button>' +
    (onOk ? '<button class="btn" data-ok>' + (okText || 'บันทึก') + '</button>' : '') + '</div></div>';
  document.body.appendChild(bg);
  var close = function () { bg.remove(); document.removeEventListener('keydown', key); };
  var key = function (e) { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', key);
  bg.addEventListener('click', function (e) { if (e.target === bg || e.target.hasAttribute('data-x')) close(); });
  var ok = bg.querySelector('[data-ok]');
  if (ok) ok.addEventListener('click', async function () {
    ok.disabled = true;
    try { if ((await onOk(bg)) !== false) close(); } catch (e) { toast(e.message, true); } finally { ok.disabled = false; }
  });
  // โฟกัสช่องแรกให้อัตโนมัติ – แต่ไม่แย่งโฟกัสถ้าผู้ใช้เริ่มกรอกช่องอื่นแล้ว (ป้องกันค่าที่พิมพ์หาย)
  var first = bg.querySelector('input:not([type=hidden]):not([disabled]),select,textarea'); if (first) setTimeout(function () { if (!bg.contains(document.activeElement)) first.focus(); }, 30);
  return bg;
}
function val(bg, id) { var e = bg.querySelector('#' + id); return e ? String(e.value).trim() : ''; }
function inp(id, lab, v, type, extra) { return '<div><label class="f" for="' + id + '">' + lab + '</label><input id="' + id + '" class="i" ' + (type ? 'type="' + type + '" ' : '') + 'value="' + esc(v == null ? '' : v) + '" ' + (extra || '') + '></div>'; }
function opts(list, cur, blank) { return (blank != null ? '<option value="">' + esc(blank) + '</option>' : '') + list.map(function (x) { var v = Array.isArray(x) ? x[0] : x, l = Array.isArray(x) ? x[1] : x; return '<option value="' + esc(v) + '"' + (String(v) === String(cur) ? ' selected' : '') + '>' + esc(l) + '</option>'; }).join(''); }
function confirmBox(msg, okText) {
  return new Promise(function (res) {
    var done = false;
    var bg = modal('<h2>ยืนยัน</h2><p>' + esc(msg) + '</p>', function () { done = true; res(true); }, okText || 'ยืนยัน');
    new MutationObserver(function (m, o) { if (!document.body.contains(bg)) { o.disconnect(); if (!done) res(false); } }).observe(document.body, { childList: true });
  });
}

/* ---------------- files (รูปภาพ/PDF เก็บเป็น Blob ในเครื่อง) ---------------- */
function filesOf(kind, ref) { return S.files.filter(function (f) { return f.kind === kind && String(f.ref) === String(ref); }).sort(function (a, b) { return (a.created || '') < (b.created || '') ? -1 : 1; }); }
function fileUrl(f) { if (!f.blob) return ''; if (!S.urls[f.id]) S.urls[f.id] = URL.createObjectURL(f.blob); return S.urls[f.id]; }
function hydrateImgs() {
  var jobs = [];
  $$('[data-fimg]').forEach(function (el) {
    var f = S.files.filter(function (x) { return x.id === el.dataset.fimg; })[0]; if (!f) return;
    var show = function () { var u = fileUrl(f); if (!u) return; if (el.tagName === 'IMG') el.src = u; else { el.style.backgroundImage = 'url("' + u + '")'; el.textContent = ''; } };
    el.removeAttribute('data-fimg');
    if (f.blob) show();
    else if (f.driveId && typeof ensureBlob === 'function') { if (el.tagName !== 'IMG') el.innerHTML = '<span class="spin"></span>'; jobs.push(ensureBlob(f).then(show, function () { if (el.tagName !== 'IMG') el.textContent = 'โหลดรูปไม่ได้'; })); }
  });
  return Promise.all(jobs);
}
function compressImage(file, doc) {
  var max = doc ? 2400 : 1600, q = doc ? 0.9 : 0.82;
  return new Promise(function (res, rej) {
    var url = URL.createObjectURL(file), img = new Image();
    img.onload = function () {
      var w = img.naturalWidth, h = img.naturalHeight, sc = Math.min(1, max / Math.max(w, h));
      var c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * sc)); c.height = Math.max(1, Math.round(h * sc));
      var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(function (b) {
        // ถ้าไฟล์เดิมเล็กกว่าผลที่ย่อ และไม่ต้องย่อขนาด ใช้ไฟล์เดิม (ไม่ทำให้ใหญ่ขึ้นหรือคมชัดลดลง)
        if (sc === 1 && /^image\/(jpeg|png|webp)$/.test(file.type) && file.size <= b.size) return res({ blob: file, mime: file.type, name: file.name || 'photo' });
        res({ blob: b, mime: 'image/jpeg', name: (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg' });
      }, 'image/jpeg', q);
    };
    img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('อ่านรูป ' + file.name + ' ไม่ได้ (รองรับ JPG/PNG/WEBP)')); };
    img.src = url;
  });
}
async function addFiles(kind, ref, list, allowPdf) {
  var arr = Array.prototype.slice.call(list || []), ok = 0;
  for (var i = 0; i < arr.length; i++) {
    var f = arr[i];
    try {
      var r;
      if (f.type === 'application/pdf') { if (!allowPdf) throw new Error('แนบได้เฉพาะรูปภาพ'); if (f.size > 20 * 1024 * 1024) throw new Error(f.name + ' ใหญ่เกิน 20 MB'); r = { blob: f, mime: f.type, name: f.name }; }
      else if (/^image\//.test(f.type)) r = await compressImage(f, kind === 'submittal');
      else throw new Error(f.name + ': รองรับเฉพาะรูปภาพ' + (allowPdf ? ' และ PDF' : ''));
      var rec = { id: uid(), projectId: S.P.id, kind: kind, ref: String(ref), caption: '', mime: r.mime, name: r.name, size: r.blob.size, blob: r.blob, created: new Date().toISOString() };
      await DB.put('files', rec); S.files.push(rec); ok++;
    } catch (e) { toast(e.message, true); await new Promise(function (z) { setTimeout(z, 1200); }); }
  }
  if (ok) toast('เพิ่มแล้ว ' + ok + ' ไฟล์');
  return ok;
}
function filesBlock(kind, ref, editable, allowPdf) {
  var list = filesOf(kind, ref);
  var h = editable ? '<label class="drop">' + ic('camera') + (allowPdf ? 'เพิ่มรูปถ่าย หรือไฟล์ PDF (สเปก/แคตตาล็อก/ใบรับรอง)' : 'เพิ่มรูปถ่ายหน้างาน') + ' – แตะเพื่อเลือก หรือถ่ายจากกล้อง' +
    '<input type="file" class="hidden" multiple accept="' + (allowPdf ? 'image/*,application/pdf' : 'image/*') + '" data-up="' + kind + '" data-ref="' + esc(ref) + '" data-pdf="' + (allowPdf ? 1 : 0) + '"></label>' : '';
  if (!list.length) return h + (editable ? '' : '<div class="muted">ไม่มีไฟล์แนบ</div>');
  return h + '<div class="files">' + list.map(function (f) {
    var pdf = f.mime === 'application/pdf';
    return '<div class="fcard"><div class="fthumb" ' + (pdf ? '' : 'data-fimg="' + f.id + '"') + ' data-open="' + f.id + '" title="' + esc(f.name) + '">' + (pdf ? ic('file') : '') + '</div>' +
      (editable ? '<input class="fcap" data-cap="' + f.id + '" placeholder="คำอธิบาย…" value="' + esc(f.caption) + '">' : '<div class="fcap">' + esc(f.caption || f.name) + '</div>') +
      (editable ? '<button class="fdel" data-fdel="' + f.id + '" aria-label="ลบไฟล์">' + ic('trash') + '</button>' : '') + '</div>';
  }).join('') + '</div>';
}
async function openFile(id) {
  var f = S.files.filter(function (x) { return x.id === id; })[0]; if (!f) return;
  if (!f.blob && f.driveId) { toast('กำลังโหลดไฟล์…'); try { await ensureBlob(f); } catch (e) { return toast(e.message, true); } }
  var u = fileUrl(f); if (!u) return toast('ไม่พบไฟล์ในเครื่องนี้', true);
  if (f.mime === 'application/pdf') { window.open(u, '_blank', 'noopener'); return; }
  var lb = document.createElement('div'); lb.className = 'lightbox'; lb.innerHTML = '<img src="' + u + '" alt="' + esc(f.caption) + '">'; lb.onclick = function () { lb.remove(); }; document.body.appendChild(lb);
}

/* ---------------- HOME: รายการโครงการ ---------------- */
async function vHome() {
  S.projects = (await DB.all('projects')).sort(function (a, b) { return (b.updated || '') < (a.updated || '') ? -1 : 1; });
  var allTasks = await DB.all('tasks'), allEots = await DB.all('eots'), lastBk = await meta('lastBackup');
  S.projects.forEach(function (p) { p._eots = allEots.filter(function (e) { return e.projectId === p.id; }); });
  var h = '';
  var old = !lastBk || diffDays(today(), D(lastBk.slice(0, 10))) >= 7;
  if (S.projects.length && old) h += '<div class="banner warn"><span class="grow">' + (lastBk ? 'สำรองข้อมูลครั้งล่าสุด ' + th(lastBk.slice(0, 10), true) : 'ยังไม่เคยสำรองข้อมูล') + ' – ข้อมูลอยู่ในเครื่องนี้เท่านั้น ควรสำรองสัปดาห์ละครั้ง</span><button class="btn sm acc" data-act="backup">สำรองเดี๋ยวนี้</button></div>';
  h = pageHead('โครงการทั้งหมด', S.projects.filter(function (p) { return !p.archived; }).length + ' โครงการที่กำลังดำเนินการ • ข้อมูลเก็บในเครื่องนี้', '<button class="btn sec" data-act="importXlsx">' + ic('upload') + 'นำเข้าจาก Excel</button><button class="btn" data-act="newProject">' + ic('plus') + 'โครงการใหม่</button>') + h;
  if (!S.projects.length) return h + '<div class="card empty"><div style="font-size:53px"></div><p><b>ยังไม่มีโครงการ</b></p><p>เริ่มจากสร้างโครงการใหม่ นำเข้าจากไฟล์ Excel v4 ที่มีอยู่ หรือลองโครงการตัวอย่างเพื่อดูการทำงาน</p>' +
    '<div class="row" style="justify-content:center"><button class="btn" data-act="newProject">' + ic('plus') + 'โครงการใหม่</button><button class="btn sec" data-act="samples">ลองโครงการตัวอย่าง 3 แบบ</button></div></div>' + installCard();
  var act = S.projects.filter(function (p) { return !p.archived; }), arc = S.projects.filter(function (p) { return p.archived; });
  var card = function (p) {
    var ts = allTasks.filter(function (t) { return t.projectId === p.id; }), s = projectSummary(p, ts), left = diffDays(s.end, today());
    return '<div class="card pcard" data-go="/p/' + p.id + '" tabindex="0"><div class="between"><div class="grow"><div class="t" style="font-weight:700;font-size:21px">' + esc(p.name) + '</div>' +
      '<div class="muted">' + (p.type === 'multi' ? 'หลายงานส่วน (' + (p.parts || []).length + ' งานส่วน)' : 'งานเดียว') + ' • ' + s.n + ' รายการ • ' + (left >= 0 ? 'เหลือ ' + left + ' วัน' : 'เลยกำหนด ' + (-left) + ' วัน') + '</div></div>' + badge(s.st) + '</div>' +
      '<div class="bar"><i style="width:' + Math.min(100, s.act * 100).toFixed(1) + '%"></i><b style="left:' + Math.min(100, s.plan * 100).toFixed(1) + '%"></b></div>' +
      '<div class="muted">ผลงานจริง <b>' + pct(s.act) + '</b> • แผน ' + pct(s.plan) + ' • สิ้นสุดสัญญา ' + th(s.end, true) + '</div></div>';
  };
  h += act.map(card).join('') || '<div class="card empty">ไม่มีโครงการที่กำลังดำเนินการ</div>';
  h += installCard();
  if (arc.length) h += '<details class="pgroup"><summary>โครงการที่เก็บเข้าคลัง (' + arc.length + ')</summary>' + arc.map(card).join('') + '</details>';
  return h;
}
var PROJ_FIELDS = [['employer', 'ผู้ว่าจ้าง'], ['contractor', 'ผู้รับจ้าง'], ['contract_no', 'เลขที่สัญญา'], ['contract_date', 'วันที่ลงนามสัญญา', 'date'],
  ['bac', 'มูลค่าสัญญา (บาท)', '', 'inputmode="decimal"'], ['start', 'วันเริ่มสัญญา', 'date'], ['duration', 'ระยะเวลาสัญญา (วัน)', '', 'inputmode="numeric"'], ['eot_days', 'ขยายเวลาที่อนุมัติแล้ว (วัน)', '', 'inputmode="numeric"'],
  ['org', 'ส่วนราชการ (หัวบันทึกข้อความ)'], ['doc_prefix', 'เลขที่หนังสือ (ที่)'], ['supervisor_name', 'ชื่อผู้ควบคุมงาน'], ['supervisor_pos', 'ตำแหน่งผู้ควบคุมงาน'],
  ['chair', 'ประธานกรรมการตรวจรับ'], ['member1', 'กรรมการ คนที่ 1'], ['member2', 'กรรมการ คนที่ 2']];
function projectForm(p) {
  p = p || { type: 'single', start: iso(today()), duration: 180, eot_days: 0, supervisor_pos: 'ผู้ควบคุมงาน',
    parts: ['งานก่อสร้างอาคาร'], cats: ['งานเตรียมการ', 'งานโครงสร้าง', 'งานสถาปัตยกรรม', 'งานระบบ'] };
  return '<label class="f" for="pName">ชื่อโครงการ</label><input id="pName" class="i" value="' + esc(p.name) + '">' +
    '<label class="f">ลักษณะงาน</label><div class="seg" id="pType">' +
    '<button type="button" data-t="single" class="' + (p.type !== 'multi' ? 'on' : '') + '">งานก่อสร้างงานเดียว</button><button type="button" data-t="multi" class="' + (p.type === 'multi' ? 'on' : '') + '">โครงการหลายงานส่วน</button></div>' +
    '<p class="muted" id="pTypeHelp"></p>' +
    '<div class="grid2">' + PROJ_FIELDS.map(function (f) { return inp('pf_' + f[0], f[1], p[f[0]], f[2], f[3]); }).join('') + '</div>' +
    '<div class="grid2"><div id="pPartsBox"><label class="f" for="pParts">งานส่วน (บรรทัดละ 1 รายการ) เช่น อาคาร รั้ว ถนน</label><textarea id="pParts" class="i" rows="5">' + esc((p.parts || []).join('\n')) + '</textarea></div>' +
    '<div><label class="f" for="pCats">หมวดงาน (บรรทัดละ 1 รายการ)</label><textarea id="pCats" class="i" rows="5">' + esc((p.cats || []).join('\n')) + '</textarea></div></div>';
}
function wireProjectForm(bg) {
  var setType = function (t) {
    $$('#pType button', bg).forEach(function (b) { b.classList.toggle('on', b.dataset.t === t); });
    bg.querySelector('#pPartsBox').classList.toggle('hidden', t !== 'multi');
    bg.querySelector('#pTypeHelp').textContent = t === 'multi' ? 'เช่น โครงการที่มีอาคาร รั้ว รางระบายน้ำ ถนน ทำพร้อมกันได้ – สรุปผลแยกรายงานส่วนให้อัตโนมัติ' : 'อาคารหรืองานก่อสร้างเดียว – รายการงานแบ่งตามหมวดงาน';
    bg.dataset.type = t;
  };
  $$('#pType button', bg).forEach(function (b) { b.onclick = function () { setType(b.dataset.t); }; });
  setType($('#pType button.on', bg).dataset.t);
}
function readProjectForm(bg, p) {
  p = p || { id: uid(), created: new Date().toISOString() };
  p.name = val(bg, 'pName'); if (!p.name) throw new Error('กรอกชื่อโครงการ');
  p.type = bg.dataset.type || 'single';
  PROJ_FIELDS.forEach(function (f) { p[f[0]] = val(bg, 'pf_' + f[0]); });
  if (!D(p.start)) throw new Error('กรอกวันเริ่มสัญญา');
  if (num(p.duration) <= 0) throw new Error('ระยะเวลาสัญญาต้องมากกว่า 0');
  var lines = function (id) { return val(bg, id).split('\n').map(function (x) { return x.trim(); }).filter(Boolean); };
  p.cats = lines('pCats'); if (!p.cats.length) p.cats = ['งานทั่วไป'];
  p.parts = p.type === 'multi' ? lines('pParts') : (p.parts && p.parts.length ? [p.parts[0]] : ['งานหลัก']);
  if (!p.parts.length) throw new Error('โครงการหลายงานส่วนต้องมีอย่างน้อย 1 งานส่วน');
  return p;
}
function newProject() {
  var bg = modal('<h2>โครงการใหม่</h2>' + projectForm(), async function (bg) {
    var p = readProjectForm(bg); p.updated = new Date().toISOString();
    await DB.put('projects', p); toast('สร้างโครงการแล้ว – เพิ่มรายการงานได้เลย'); go('/p/' + p.id + '/tasks');
  }, 'สร้างโครงการ', true);
  wireProjectForm(bg);
}

/* ---------------- นำเข้าไฟล์ Excel v4 (สร้างเป็นโครงการใหม่) ---------------- */
function loadXlsx() {
  if (window.XLSX) return Promise.resolve();
  var tryLoad = function (src) { return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); };
  return tryLoad('vendor/xlsx.full.min.js').catch(function () { return tryLoad('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'); })
    .catch(function () { throw new Error('โหลดตัวอ่านไฟล์ Excel ไม่ได้'); });
}
function sheetRows(ws) { if (!ws || !ws['!ref']) return []; var r = XLSX.utils.decode_range(ws['!ref']); r.s.c = 0; r.s.r = 0; return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '', range: r }); }
function xDate(v) { if (v === '' || v == null) return ''; if (typeof v === 'number') { var p = XLSX.SSF.parse_date_code(v); return p ? iso(new Date(p.y, p.m - 1, p.d)) : ''; } var r = parseDateAny(v); return r === 'X' ? '' : r; }
function xPct(v) { if (v === '' || v == null) return ''; var n = typeof v === 'number' ? v : num(String(v).replace('%', '')) / (String(v).indexOf('%') >= 0 ? 100 : 1); return n > 1 ? +n.toPrecision(12) : +(n * 100).toPrecision(12); }
function hdrKey(h) { return String(h == null ? '' : h).split('\n')[0].trim(); }
function parseV4(wb) {
  var out = { tasks: [], settings: {}, warnings: [] };
  var sn = wb.SheetNames.filter(function (n) { return /แผนงาน|Schedule/i.test(n); })[0];
  if (!sn) throw new Error('ไม่พบชีต "แผนงาน" – ไฟล์นี้ไม่ใช่แม่แบบ v4 หรือไฟล์ที่ส่งออกจากแอปนี้');
  var rows = sheetRows(wb.Sheets[sn]);
  var hr = rows.findIndex(function (r) { return r.some(function (c) { return hdrKey(c) === 'รายการงาน'; }); });
  if (hr < 0) throw new Error('ไม่พบหัวตาราง "รายการงาน" ในชีตแผนงาน');
  var H = rows[hr].map(hdrKey), col = function (n) { return H.indexOf(n); };
  var all = function (n) { return H.map(function (h, i) { return h === n ? i : -1; }).filter(function (i) { return i >= 0; }); };
  var st = all('เริ่ม'), fi = all('เสร็จ'), cPart = col('งานส่วน'), cCat = col('หมวดงาน'), cDesc = col('รายการงาน'), cBoq = col('มูลค่า BOQ'), cW = col('น้ำหนักกำหนดเอง'), cP = col('% งานนี้'), cRm = col('หมายเหตุ / ปัญหา');
  if (st.length < 3 && col('เริ่มแผน') >= 0) { st = [col('เริ่มแผน'), col('เริ่มเร่งรัด'), col('เริ่มจริง')]; fi = [col('เสร็จแผน'), col('เสร็จเร่งรัด'), col('เสร็จจริง')]; cW = col('น้ำหนัก'); cP = col('% จริง'); cRm = col('หมายเหตุ'); }
  if (st.length < 3 || fi.length < 3 || cDesc < 0 || st.concat(fi).some(function (x) { return x < 0; })) throw new Error('โครงสร้างคอลัมน์ในชีตแผนงานไม่ตรงกับแม่แบบ v4');
  for (var i = hr + 1; i < rows.length; i++) {
    var r = rows[i], desc = String(r[cDesc] || '').trim();
    if (!desc) continue; if (/^รวม/.test(desc)) break;
    var t = { part: cPart >= 0 ? String(r[cPart] || '').trim() : '', cat: cCat >= 0 ? String(r[cCat] || '').trim() : '', desc: desc,
      boq: r[cBoq] === '' || cBoq < 0 ? '' : String(num(r[cBoq])), weight: cW >= 0 ? String(xPct(r[cW])) : '',
      bs: xDate(r[st[0]]), bf: xDate(r[fi[0]]), rs: xDate(r[st[1]]), rf: xDate(r[fi[1]]), as: xDate(r[st[2]]), af: xDate(r[fi[2]]),
      pct: cP >= 0 && r[cP] !== '' ? String(+xPct(r[cP]).toFixed(2)) : '0', remark: cRm >= 0 ? String(r[cRm] || '') : '' };
    if (!t.bs || !t.bf) { out.warnings.push('แถว ' + (i + 1) + ' "' + desc.slice(0, 30) + '" ไม่มีวันแผน – ข้าม'); continue; }
    out.tasks.push(t);
  }
  var ssn = wb.SheetNames.filter(function (n) { return /ตั้งค่า|Setup/i.test(n); })[0];
  if (ssn) {
    var map = [['ชื่อโครงการ (ไทย)', 'name', 't'], ['ผู้ว่าจ้าง', 'employer', 't'], ['ผู้รับจ้าง', 'contractor', 't'], ['เลขที่สัญญา', 'contract_no', 't'],
      ['มูลค่าสัญญา', 'bac', 'n'], ['วันเริ่มสัญญา', 'start', 'd'], ['ระยะเวลาสัญญา', 'duration', 'n']];
    sheetRows(wb.Sheets[ssn]).forEach(function (r) { var lab = String(r[1] || ''); map.forEach(function (m) {
      if (lab.indexOf(m[0]) === 0 && r[2] !== '' && out.settings[m[1]] == null) { var v = r[2]; out.settings[m[1]] = m[2] === 'n' ? String(num(v)) : m[2] === 'd' ? xDate(v) : String(v).trim(); } }); });
  }
  var smn = wb.SheetNames.filter(function (n) { return n === 'สรุป'; })[0];
  if (!ssn && smn) sheetRows(wb.Sheets[smn]).forEach(function (r) { var lab = String(r[0] || ''), v = r[1]; if (v === '' || v == null) return;
    if (lab === 'โครงการ') out.settings.name = String(v); else if (lab === 'ผู้รับจ้าง') out.settings.contractor = String(v); else if (lab === 'ผู้ว่าจ้าง') out.settings.employer = String(v);
    else if (lab === 'มูลค่าสัญญาเดิม') out.settings.bac = String(num(v)); else if (lab === 'วันเริ่มสัญญา') out.settings.start = xDate(v); else if (lab === 'ระยะเวลาสัญญา (วัน)') out.settings.duration = String(num(v)); });
  return out;
}
function importXlsx() {
  var parsed = null;
  var bg = modal('<h2>สร้างโครงการจากไฟล์ Excel</h2><p class="muted">รองรับไฟล์แม่แบบ v4 (Plan_vs_Actual หรือ MultiPackage) และไฟล์ที่ส่งออกจากแอปนี้ • อ่านรายการงาน วันแผน วันจริง % ผลงาน และข้อมูลสัญญา</p>' +
    '<label class="drop">เลือกไฟล์ .xlsx<input type="file" id="xf" class="hidden" accept=".xlsx"></label><div id="xPrev"></div>', async function () {
      if (!parsed) throw new Error('เลือกไฟล์ก่อน');
      var s = parsed.settings, multi = parsed.tasks.some(function (t) { return t.part; }) && new Set(parsed.tasks.map(function (t) { return t.part; })).size > 1;
      var p = { id: uid(), created: new Date().toISOString(), updated: new Date().toISOString(), name: val(bg, 'xName') || s.name || 'โครงการจาก Excel', type: multi ? 'multi' : 'single',
        employer: s.employer || '', contractor: s.contractor || '', contract_no: s.contract_no || '', bac: s.bac || '', start: s.start || iso(today()), duration: s.duration || '180', eot_days: '0',
        supervisor_pos: 'ผู้ควบคุมงาน', parts: [], cats: [] };
      parsed.tasks.forEach(function (t) { t.part = t.part || 'งานหลัก'; t.cat = t.cat || 'งานทั่วไป'; if (p.parts.indexOf(t.part) < 0) p.parts.push(t.part); if (p.cats.indexOf(t.cat) < 0) p.cats.push(t.cat); });
      var now = new Date().toISOString(), tasks = parsed.tasks.map(function (t, i) { return Object.assign({ id: uid() + i, projectId: p.id, order: i + 1, updated: now }, t); });
      var prog = tasks.filter(function (t) { return num(t.pct) > 0; }).map(function (t) {
        return { id: uid() + t.id, projectId: p.id, taskId: t.id, date: t.af || (t.as && D(t.as) > today() ? t.as : iso(today())), pct: num(t.pct), note: 'นำเข้าจาก Excel', source: 'import', ts: Date.now() }; });
      await DB.put('projects', p); await DB.putMany('tasks', tasks); await DB.putMany('progress', prog);
      toast('สร้างโครงการ "' + p.name + '" แล้ว (' + tasks.length + ' รายการ)'); go('/p/' + p.id);
    }, 'สร้างโครงการ', true);
  bg.querySelector('#xf').addEventListener('change', async function (e) {
    var f = e.target.files[0], box = bg.querySelector('#xPrev'); if (!f) return;
    box.innerHTML = '<p class="muted"><span class="spin"></span> กำลังอ่านไฟล์…</p>';
    try {
      await loadXlsx(); parsed = parseV4(XLSX.read(await f.arrayBuffer(), { type: 'array' }));
      var p = parsed, started = p.tasks.filter(function (t) { return num(t.pct) > 0; }).length, nParts = new Set(p.tasks.map(function (t) { return t.part; }).filter(Boolean)).size;
      box.innerHTML = inp('xName', 'ชื่อโครงการ', p.settings.name || f.name.replace(/\.xlsx$/i, '')) +
        '<p style="margin-top:10px">พบ <b>' + p.tasks.length + '</b> รายการงาน' + (nParts > 1 ? ' ใน <b>' + nParts + '</b> งานส่วน' : '') + ' • มีผลงานแล้ว ' + started + ' รายการ' +
        (p.settings.bac ? ' • มูลค่าสัญญา ' + money(p.settings.bac) : '') + (p.settings.start ? ' • เริ่ม ' + th(p.settings.start, true) + ' ' + (p.settings.duration || '') + ' วัน' : '') + '</p>' +
        (p.warnings.length ? '<p class="warn-t">⚠ ' + p.warnings.map(esc).join('<br>⚠ ') + '</p>' : '') +
        '<div class="tw" style="max-height:230px;overflow:auto"><table><tr><th>งานส่วน/หมวด</th><th>รายการ</th><th>แผน</th><th class="num">% จริง</th></tr>' +
        p.tasks.slice(0, 50).map(function (t) { return '<tr><td>' + esc(t.part ? t.part + ' • ' : '') + esc(t.cat) + '</td><td>' + esc(t.desc) + '</td><td>' + th(t.bs, true) + ' – ' + th(t.bf, true) + '</td><td class="num">' + num(t.pct) + '%</td></tr>'; }).join('') + '</table></div>' +
        '<p class="muted">ผลงานที่มีอยู่จะบันทึกเป็นประวัติ ณ วันนำเข้า (หรือวันเสร็จจริง) – ประวัติรายงวดใน Excel ไม่ถูกนำเข้า</p>';
    } catch (er) { parsed = null; box.innerHTML = '<p class="bad-t">' + esc(er.message) + '</p>'; }
  });
}

/* ---------------- DASHBOARD ---------------- */
function kpi(l, v, s, cls) { return '<div class="kpi"><div class="l">' + l + '</div><div class="v ' + (cls || '') + '">' + v + '</div><div class="s">' + (s || '') + '</div></div>'; }
function groupStats(filterFn, d, hist) {
  var w = weightFn(), ts = S.tasks.filter(filterFn), W = ts.reduce(function (a, t) { return a + w(t); }, 0);
  if (!W) return null;
  var pl = ts.reduce(function (a, t) { return a + w(t) * spanPct(D(t.bs), D(t.bf), d); }, 0) / W;
  var ac = ts.reduce(function (a, t) { return a + w(t) * num(t.pct) / 100; }, 0) / W;
  var s = ts.map(function (t) { return D(t.bs); }).filter(Boolean).sort(function (a, b) { return a - b; })[0];
  var f = ts.map(function (t) { return D(t.bf); }).filter(Boolean).sort(function (a, b) { return b - a; })[0];
  return { n: ts.length, W: W, pl: pl, ac: ac, st: spiState(ac, pl), s: s, f: f, behind: ts.filter(function (t) { return taskStatus(t, d).k === 'bad'; }).length };
}
async function vDash() {
  var d = today(), pid = S.P.id;
  if (!S.tasks.length) return '<div class="card empty"><div style="font-size:53px"></div><p><b>ยังไม่มีรายการงาน</b></p><p>เพิ่มรายการงานพร้อมวันเริ่ม-เสร็จตามแผน แล้วระบบจะคำนวณแผนงานและ S-Curve ให้</p>' +
    '<button class="btn" data-go="/p/' + pid + '/tasks">ไปที่แท็บผลงาน</button></div>';
  var pl = planAt(d), ac = actualNow(), rv = planAt(d, true), el = diffDays(d, projStart()) + 1, tot = projDur() + num(S.P.eot_days), rem = diffDays(projEnd(), d);
  var spi = pl ? ac / pl : 0, vd = Math.round((ac - pl) * projDur());
  var behind = S.tasks.filter(function (t) { return taskStatus(t).k === 'bad'; });
  var risk = S.submittals.filter(function (s) { var k = subRisk(s).k; return k === 'bad' || k === 'warn'; }).length;
  var todayRep = S.daily.filter(function (x) { return x.date === iso(d); })[0];
  var h = '';
  if (!todayRep && d >= projStart() && d <= addDays(projEnd(), 60)) h += '<div class="banner info"><span class="grow">ยังไม่ได้บันทึกรายงานประจำวันของวันนี้</span><button class="btn sm" data-go="/p/' + pid + '/daily/' + iso(d) + '">บันทึกเลย</button></div>';
  var L = ldInfo(), nextI = sortedInst().filter(function (i) { return !i.accepted; })[0];
  h = pageHead('ภาพรวมโครงการ', 'ข้อมูล ณ วันที่ ' + th(d) + ' • วันที่ ' + Math.max(0, el) + ' ของสัญญา', badge(spiState(ac, pl)) +
    '<button class="btn sec" data-act="printDash">' + ic('print') + 'พิมพ์</button><button class="btn" data-act="exportV4">' + ic('excel') + 'ส่งออกรายงาน Excel</button>') + h;
  h += '<div class="card"><h2>ความก้าวหน้าและระยะเวลา</h2><div class="kpis">' +
    kpi('ผลงานตามแผน', pct(pl), (S.tasks.some(function (t) { return t.rs || t.rf; }) ? 'แผนเร่งรัด ' + pct(rv) : '&nbsp;')) +
    kpi('ผลงานจริง', pct(ac), S.tasks.length + ' รายการ', ac >= pl ? 'ok-t' : 'bad-t') +
    kpi('เร็ว/ช้ากว่าแผน', (ac - pl >= 0 ? '+' : '') + pct(ac - pl), 'ประมาณ ' + (vd >= 0 ? '+' : '') + vd + ' วัน', ac >= pl ? 'ok-t' : 'bad-t') +
    kpi('SPI', spi.toFixed(2), spi >= 1 ? 'ตามแผน' : spi >= 0.9 ? 'เฝ้าระวัง' : 'ล่าช้ามาก', spi >= 1 ? 'ok-t' : spi >= 0.9 ? 'warn-t' : 'bad-t') +
    kpi('ระยะเวลา', Math.max(0, el) + ' / ' + tot + ' วัน', rem >= 0 ? 'คงเหลือ ' + rem + ' วัน' : 'เลยกำหนด ' + (-rem) + ' วัน', rem < 0 ? 'bad-t' : '') +
    kpi('ต้องติดตาม', behind.length + ' รายการ', 'วัสดุเสี่ยงกระทบแผน ' + risk + ' รายการ', behind.length ? 'bad-t' : 'ok-t') + '</div></div>' +
    '<div class="card"><div class="card-h"><h2>สัญญาและการเงิน</h2><button class="btn sm sec" data-go="/p/' + S.P.id + '/fin">รายละเอียด ' + ic('chevr') + '</button></div><div class="kpis">' +
    kpi('มูลค่าสัญญาปัจจุบัน', money(num(S.P.bac) + voNet()), voNet() ? 'รวมงานเพิ่ม-ลด ' + (voNet() > 0 ? '+' : '') + money(voNet()) : 'ตามสัญญาเดิม') +
    kpi('สิ้นสุดสัญญา', th(projEnd(), true), eotTotal() ? 'รวมขยายเวลา ' + eotTotal() + ' วัน' : 'ไม่มีการขยายเวลา') +
    kpi('งวดถัดไป', nextI ? 'งวดที่ ' + esc(nextI.no) : '-', nextI ? 'กำหนด ' + th(nextI.due, true) + ' • ' + instStatus(nextI).t : (S.installments.length ? 'ตรวจรับครบแล้ว' : 'ยังไม่บันทึกงวดงาน'), nextI && instStatus(nextI).k === 'bad' ? 'bad-t' : '') +
    kpi('ค่าปรับคาดการณ์', L.fLd == null ? '-' : money(L.fLd), L.fDelay ? 'คาดว่าช้ากว่าสัญญา ' + L.fDelay + ' วัน' : 'คาดว่าทันสัญญา', L.fDelay ? 'bad-t' : 'ok-t') + '</div></div>';
  h += '<div class="card"><h2>S-Curve แผนเทียบผลงานจริง</h2><div class="chartbox"><canvas id="curve" aria-label="กราฟ S-Curve"></canvas></div>' +
    '<p class="muted">เส้นผลงานจริงสร้างจากประวัติการอัปเดต % ของแต่ละรายการโดยอัตโนมัติ</p></div>';
  after(function () { drawCurve($('#curve')); });
  if (isMulti()) {
    h += '<div class="card"><h2>ความก้าวหน้ารายงานส่วน</h2><div class="tw"><table><tr><th>งานส่วน</th><th class="num">น้ำหนัก</th><th class="hide-m">ช่วงแผน</th><th class="num">แผน</th><th class="num">จริง</th><th class="num">SPI</th><th>สถานะ</th></tr>';
    parts().forEach(function (p) { var g = groupStats(function (t) { return t.part === p; }, d); if (!g) return;
      h += '<tr><td>' + esc(p) + (g.behind ? '<div class="muted bad-t">ล่าช้า ' + g.behind + ' รายการ</div>' : '') + '</td><td class="num">' + pct(g.W, 1) + '</td><td class="hide-m">' + th(g.s, true) + ' – ' + th(g.f, true) + '</td><td class="num">' + pct(g.pl, 1) + '</td><td class="num">' + pct(g.ac, 1) + '</td><td class="num">' + (g.pl ? (g.ac / g.pl).toFixed(2) : '-') + '</td><td>' + badge(g.st) + '</td></tr>'; });
    h += '</table></div></div>';
  }
  h += '<div class="card"><h2>ความก้าวหน้ารายหมวดงาน</h2><div class="tw"><table><tr><th>หมวดงาน</th><th class="num">น้ำหนัก</th><th class="num">แผน</th><th class="num">จริง</th><th>สถานะ</th></tr>';
  cats().forEach(function (c) { var g = groupStats(function (t) { return t.cat === c; }, d); if (!g) return;
    h += '<tr><td>' + esc(c) + '</td><td class="num">' + pct(g.W, 1) + '</td><td class="num">' + pct(g.pl, 1) + '</td><td class="num">' + pct(g.ac, 1) + '</td><td>' + badge(g.st) + '</td></tr>'; });
  h += '</table></div></div>';
  if (behind.length) {
    var w = wbsList().filter(function (o) { return taskStatus(o.t).k === 'bad'; }).map(function (o) {
      var t = o.t, p = spanPct(D(t.bs), D(t.bf), d); return { o: o, gap: p - num(t.pct) / 100 }; }).sort(function (a, b) { return b.gap - a.gap; }).slice(0, 8);
    h += '<div class="card"><h2>รายการที่ต้องติดตาม</h2>' + w.map(function (x) { var t = x.o.t;
      return '<div class="item"><div class="between"><div class="grow"><span class="muted">' + esc(x.o.wbs) + '</span> <span class="t">' + esc(t.desc) + '</span>' + (isMulti() ? '<div class="m">' + esc(t.part) + '</div>' : '') + '</div>' + badge(taskStatus(t)) + '</div>' +
        '<div class="m">จริง ' + num(t.pct) + '% • ควรได้ ' + (spanPct(D(t.bs), D(t.bf), d) * 100).toFixed(0) + '% • กำหนดเสร็จ ' + th(t.rf || t.bf, true) + '</div>' +
        '<div style="margin-top:6px"><button class="btn sm" data-prog="' + t.id + '">อัปเดตผลงาน</button></div></div>'; }).join('') + '</div>';
  }
  return h;
}
function drawCurve(canvas, upTo) {
  if (!canvas || !window.Chart) return;
  var n = totalWeeks(), hist = histIndex(), labels = [], plan = [], rev = [], act = [], d = today(), hasRev = S.tasks.some(function (t) { return t.rs || t.rf; });
  var stop = upTo || d;
  for (var i = 1; i <= n; i++) {
    var r = weekRange(i); labels.push(th(r.end, true));
    plan.push(+(planAt(r.end) * 100).toFixed(2)); if (hasRev) rev.push(+(planAt(r.end, true) * 100).toFixed(2));
    if (r.end <= stop && r.end >= projStart()) act.push(+(actualAt(r.end, hist) * 100).toFixed(2));
    else if (r.start <= stop && stop < r.end) act.push(+(actualAt(stop, hist) * 100).toFixed(2));
    else act.push(null);
  }
  var dark = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() === '#0f141c';
  var grid = dark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.07)', tick = dark ? '#9aa6ba' : '#5d6778';
  var ds = [{ label: 'แผน', data: plan, borderColor: '#2E6BC6', backgroundColor: 'transparent', pointRadius: 0, borderWidth: 2.5, tension: .2 }];
  if (hasRev) ds.push({ label: 'แผนเร่งรัด', data: rev, borderColor: '#2E9D5B', borderDash: [6, 4], pointRadius: 0, borderWidth: 2, tension: .2 });
  ds.push({ label: 'ผลงานจริง', data: act, borderColor: '#D33A2C', backgroundColor: '#D33A2C', pointRadius: 2.5, borderWidth: 2.5, spanGaps: false, tension: .1 });
  chart = new Chart(canvas, { type: 'line', data: { labels: labels, datasets: ds },
    options: { responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: 'index', intersect: false },
      scales: { y: { min: 0, max: 100, grid: { color: grid }, ticks: { color: tick, callback: function (v) { return v + '%'; } } }, x: { grid: { color: grid }, ticks: { color: tick, maxTicksLimit: 9, autoSkip: true } } },
      plugins: { legend: { position: 'bottom', labels: { color: tick } }, tooltip: { callbacks: { label: function (x) { return x.dataset.label + ': ' + (x.parsed.y == null ? '-' : x.parsed.y.toFixed(2) + '%'); } } } } } });
}

/* ---------------- TASKS ---------------- */
var TF = { part: '', st: '', q: '' };
async function vTasks() {
  var pid = S.P.id, d = today(), w = weightFn();
  var h = pageHead('แผนงานและผลงาน', S.tasks.length + ' รายการ • ผลงานรวม ' + pct(actualNow()) + ' • แผน ' + pct(planAt(d)), '<button class="btn sec" data-act="pasteTasks">' + ic('upload') + 'วางจาก Excel</button><button class="btn" data-task="">' + ic('plus') + 'เพิ่มรายการ</button>') +
    '<div class="card"><div class="row"><input class="i grow" id="tq" placeholder="ค้นหารายการงาน…" value="' + esc(TF.q) + '" style="max-width:340px">' +
    '<div class="chips">' + [['', 'ทั้งหมด'], ['active', 'กำลังทำ'], ['bad', 'ล่าช้า'], ['todo', 'ยังไม่เริ่ม'], ['done', 'เสร็จ']].map(function (x) {
      return '<button class="chip' + (TF.st === x[0] ? ' on' : '') + '" data-tf="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div></div>' +
    (isMulti() ? '<div class="chips" style="margin-top:8px">' + [''].concat(parts()).map(function (p) { return '<button class="chip' + (TF.part === p ? ' on' : '') + '" data-tp="' + esc(p) + '">' + esc(p || 'ทุกงานส่วน') + '</button>'; }).join('') + '</div>' : '') +
    '<p class="muted" style="margin:8px 0 0">ผลงานรวม <b>' + pct(actualNow()) + '</b> • แผน ' + pct(planAt(d)) + ' • แตะ "อัปเดต" เพื่อบันทึก % พร้อมวันที่ (เก็บเป็นประวัติ)</p></div>';
  var list = wbsList().filter(function (o) {
    var t = o.t, st = taskStatus(t, d);
    if (TF.part && t.part !== TF.part) return false;
    if (TF.q && (t.desc + ' ' + o.wbs + ' ' + t.cat).toLowerCase().indexOf(TF.q.toLowerCase()) < 0) return false;
    if (TF.st === 'active') return t.as && !t.af; if (TF.st === 'bad') return st.k === 'bad'; if (TF.st === 'todo') return !t.as && num(t.pct) === 0; if (TF.st === 'done') return !!t.af;
    return true;
  });
  if (!S.tasks.length) return h + '<div class="card empty">ยังไม่มีรายการงาน – กด "＋ เพิ่มรายการ" หรือ "วางจาก Excel"</div>';
  if (!list.length) return h + '<div class="card empty">ไม่พบรายการที่ตรงกับตัวกรอง</div>';
  var item = function (o) {
    var t = o.t, st = taskStatus(t, d), pl = spanPct(D(t.bs), D(t.bf), d);
    return '<div class="item"><div class="between"><div class="grow"><span class="muted">' + esc(o.wbs) + '</span> <span class="t">' + esc(t.desc) + '</span>' +
      '<div class="m">' + esc(t.cat) + ' • น้ำหนัก ' + pct(w(t)) + '</div></div>' + badge(st) + '</div>' +
      '<div class="bar"><i style="width:' + Math.min(100, num(t.pct)) + '%"></i><b style="left:' + (pl * 100).toFixed(1) + '%"></b></div>' +
      '<div class="between"><div class="m">จริง <b>' + num(t.pct) + '%</b> • ควรได้ ' + (pl * 100).toFixed(0) + '% • แผน ' + th(t.bs, true) + ' – ' + th(t.bf, true) +
      (t.rs || t.rf ? ' • เร่งรัด ' + th(t.rs || t.bs, true) + ' – ' + th(t.rf || t.bf, true) : '') + (t.as ? ' • เริ่มจริง ' + th(t.as, true) : '') + (t.af ? ' • เสร็จจริง ' + th(t.af, true) : '') + '</div>' +
      '<div class="row"><button class="btn sm" data-prog="' + t.id + '">อัปเดต</button><button class="btn sm sec" data-task="' + t.id + '" aria-label="แก้ไขรายการ">แก้ไข</button></div></div>' +
      (t.remark ? '<div class="m">' + esc(t.remark) + '</div>' : '') + '</div>';
  };
  if (isMulti() && !TF.part) {
    parts().forEach(function (p) { var L = list.filter(function (o) { return o.t.part === p; }); if (!L.length) return;
      var g = groupStats(function (t) { return t.part === p; }, d);
      h += '<details class="pgroup" open><summary>' + esc(p) + ' <span class="muted">(' + L.length + ' รายการ • จริง ' + pct(g.ac, 1) + ' / แผน ' + pct(g.pl, 1) + ')</span> ' + badge(g.st) + '</summary>' + L.map(item).join('') + '</details>'; });
    var orphan = list.filter(function (o) { return parts().indexOf(o.t.part) < 0; });
    if (orphan.length) h += '<details class="pgroup" open><summary>ไม่ระบุงานส่วน</summary>' + orphan.map(item).join('') + '</details>';
    return h;
  }
  return h + list.map(item).join('');
}
function openTask(id) {
  var t = id ? taskById(id) : { part: TF.part || parts()[0], cat: cats()[0] };
  var bg = modal('<h2>' + (id ? 'แก้ไขรายการงาน' : 'เพิ่มรายการงาน') + '</h2><div class="grid2">' +
    (isMulti() ? '<div><label class="f" for="tPart">งานส่วน</label><select id="tPart" class="i">' + opts(parts(), t.part) + '</select></div>' : '') +
    '<div><label class="f" for="tCat">หมวดงาน</label><select id="tCat" class="i">' + opts(cats(), t.cat) + '</select></div></div>' +
    '<label class="f" for="tDesc">รายการงาน</label><input id="tDesc" class="i" value="' + esc(t.desc) + '">' +
    '<div class="grid2">' + inp('tBoq', 'มูลค่า BOQ (บาท)', t.boq, '', 'inputmode="decimal"') + inp('tW', 'น้ำหนักกำหนดเอง (%) – เว้นว่างเพื่อคิดจาก BOQ', t.weight, '', 'inputmode="decimal"') +
    inp('tBs', 'เริ่ม (แผนตามสัญญา)', t.bs, 'date') + inp('tBf', 'เสร็จ (แผนตามสัญญา)', t.bf, 'date') +
    inp('tRs', 'เริ่ม (แผนเร่งรัด – ไม่บังคับ)', t.rs, 'date') + inp('tRf', 'เสร็จ (แผนเร่งรัด – ไม่บังคับ)', t.rf, 'date') + '</div>' +
    '<p class="muted">น้ำหนักงาน: ใส่มูลค่า BOQ ทุกรายการ ระบบคิดสัดส่วนให้เอง (หรือกำหนด % เองให้รวมกันได้ 100%)</p>' +
    (id ? '<div style="margin-top:8px"><button class="btn sm bad" id="tDel">ลบรายการนี้</button></div>' : ''),
    async function (bg) {
      var o = Object.assign({}, t, { id: id || uid(), projectId: S.P.id, part: isMulti() ? val(bg, 'tPart') : (parts()[0] || 'งานหลัก'), cat: val(bg, 'tCat'), desc: val(bg, 'tDesc'),
        boq: val(bg, 'tBoq').replace(/,/g, ''), weight: val(bg, 'tW').replace('%', ''), bs: val(bg, 'tBs'), bf: val(bg, 'tBf'), rs: val(bg, 'tRs'), rf: val(bg, 'tRf'), updated: new Date().toISOString() });
      if (!o.desc || !o.bs || !o.bf) throw new Error('กรอกรายการงานและวันเริ่ม-เสร็จตามแผน');
      if (o.bf < o.bs) throw new Error('วันเสร็จต้องไม่ก่อนวันเริ่ม');
      if ((o.rs && !o.rf) || (!o.rs && o.rf)) throw new Error('แผนเร่งรัดต้องมีทั้งวันเริ่มและวันเสร็จ');
      if (!id) { o.pct = 0; o.order = S.tasks.length + 1; }
      await DB.put('tasks', o); if (id) Object.assign(t, o); else S.tasks.push(o);
      toast('บันทึกแล้ว'); render();
    }, null, true);
  var del = bg.querySelector('#tDel');
  if (del) del.onclick = async function () {
    var used = S.submittals.filter(function (s) { return s.taskId === id; }).length;
    if (!(await confirmBox('ลบรายการ "' + t.desc + '" และประวัติผลงานทั้งหมดของรายการนี้?' + (used ? ' (มีรายการขออนุมัติวัสดุผูกอยู่ ' + used + ' รายการ จะถูกปลดการเชื่อมโยง)' : ''), 'ลบ'))) return;
    var ph = S.progress.filter(function (x) { return x.taskId === id; }).map(function (x) { return x.id; });
    await DB.del('tasks', id); await DB.delMany('progress', ph);
    S.tasks = S.tasks.filter(function (x) { return x.id !== id; }); S.progress = S.progress.filter(function (x) { return x.taskId !== id; });
    bg.remove(); toast('ลบแล้ว'); render();
  };
}
// บันทึกผลงาน: เพิ่มประวัติ แล้วคำนวณ % ปัจจุบัน = บันทึกที่วันที่ล่าสุด
async function recordProgress(t, dateIso, p, note, source) {
  var e = { id: uid(), projectId: S.P.id, taskId: t.id, date: dateIso, pct: p, note: note || '', source: source || 'manual', ts: Date.now() };
  await DB.put('progress', e); S.progress.push(e);
  await syncTaskPct(t);
}
async function syncTaskPct(t) {
  var a = S.progress.filter(function (x) { return x.taskId === t.id; }).sort(function (x, y) { return x.date < y.date ? -1 : x.date > y.date ? 1 : (x.ts || 0) - (y.ts || 0); });
  t.pct = a.length ? num(a[a.length - 1].pct) : 0;
  var firstPos = a.filter(function (x) { return num(x.pct) > 0; })[0];
  if (!t.as && firstPos) t.as = firstPos.date;
  if (!t.af && t.pct >= 100) { t.af = a[a.length - 1].date; t.autoAf = true; }
  if (t.pct < 100 && t.af && t.autoAf) { t.af = ''; }
  t.updated = new Date().toISOString(); await DB.put('tasks', t);
}
function openProgress(id, presetDate) {
  var t = taskById(id); if (!t) return;
  var hist = S.progress.filter(function (x) { return x.taskId === id; }).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  var bg = modal('<h2>อัปเดตผลงาน</h2><p><span class="muted">' + esc(wbsOf(id)) + '</span> <b>' + esc(t.desc) + '</b></p>' +
    '<div class="grid2">' + inp('pDate', 'ณ วันที่', presetDate || iso(today()), 'date') + inp('pPct', '% ความคืบหน้าของรายการนี้', num(t.pct), 'number', 'min="0" max="100" step="1" inputmode="numeric"') + '</div>' +
    '<input id="pRange" type="range" min="0" max="100" value="' + num(t.pct) + '" style="width:100%" aria-label="% ผลงาน">' +
    '<div class="chips" style="margin:4px 0">' + [0, 10, 25, 50, 75, 90, 100].map(function (v) { return '<button type="button" class="chip" data-pp="' + v + '">' + v + '%</button>'; }).join('') + '</div>' +
    '<div class="grid2">' + inp('pAs', 'วันเริ่มจริง', t.as, 'date') + inp('pAf', 'วันเสร็จจริง (ถ้าเสร็จแล้ว)', t.af, 'date') + '</div>' +
    '<label class="f" for="pNote">หมายเหตุ / ปัญหา</label><textarea id="pNote" class="i" rows="2">' + esc(t.remark) + '</textarea>' +
    '<p class="muted">วัด % จากปริมาณงานจริง เช่น ตอกเข็ม 45 จาก 60 ต้น = 75% ไม่ใช้เวลาหรือเงินที่จ่ายไป</p>' +
    (hist.length ? '<details class="pgroup"><summary>ประวัติผลงาน (' + hist.length + ')</summary><table><tr><th>วันที่</th><th class="num">%</th><th>ที่มา</th><th></th></tr>' +
      hist.map(function (x) { return '<tr><td>' + th(x.date, true) + '</td><td class="num">' + num(x.pct) + '%</td><td class="muted">' + esc(x.source === 'daily' ? 'รายงานรายวัน' : x.source === 'import' ? 'นำเข้า' : 'อัปเดต') + (x.note && x.source !== 'import' ? ' – ' + esc(x.note) : '') + '</td><td><button class="fdel" data-hdel="' + x.id + '" aria-label="ลบประวัตินี้">ลบ</button></td></tr>'; }).join('') + '</table></details>' : ''),
    async function (bg) {
      var p = num(val(bg, 'pPct')), dt = val(bg, 'pDate'), as = val(bg, 'pAs'), af = val(bg, 'pAf');
      if (!D(dt)) throw new Error('ระบุวันที่'); if (p < 0 || p > 100) throw new Error('% ต้องอยู่ระหว่าง 0–100');
      if (af && p < 100) throw new Error('ใส่วันเสร็จจริงแล้ว % ต้องเป็น 100');
      if (D(dt) > today()) throw new Error('บันทึกผลงานล่วงหน้าไม่ได้');
      t.as = as || (p > 0 ? (t.as || dt) : t.as); t.af = af; t.autoAf = !af; t.remark = val(bg, 'pNote');
      await recordProgress(t, dt, p, '', 'manual');
      if (af) { t.af = af; t.autoAf = false; await DB.put('tasks', t); }
      toast('บันทึกผลงาน ' + p + '% แล้ว'); render();
    }, 'บันทึกผลงาน');
  var P = bg.querySelector('#pPct'), R = bg.querySelector('#pRange');
  R.oninput = function () { P.value = R.value; }; P.oninput = function () { R.value = P.value; };
  $$('[data-pp]', bg).forEach(function (b) { b.onclick = function () { P.value = R.value = b.dataset.pp; }; });
  $$('[data-hdel]', bg).forEach(function (b) { b.onclick = async function () {
    await DB.del('progress', b.dataset.hdel); S.progress = S.progress.filter(function (x) { return x.id !== b.dataset.hdel; });
    await syncTaskPct(t); bg.remove(); toast('ลบประวัติแล้ว'); render(); openProgress(id); }; });
}
function pasteTasks() {
  var bg = modal('<h2>วางรายการงานจาก Excel</h2><p class="muted">คัดลอกแถวจาก Excel แล้ววาง (ไม่ต้องมีหัวตาราง) เรียงคอลัมน์:<br><b>' + (isMulti() ? 'งานส่วน | ' : '') + 'หมวดงาน | รายการงาน | มูลค่า BOQ | น้ำหนัก % | เริ่มแผน | เสร็จแผน</b><br>วันที่ใช้ได้ทั้ง 20/02/2569, 20/02/2026, 2026-02-20 • งานส่วน/หมวดใหม่จะเพิ่มให้อัตโนมัติ</p>' +
    '<textarea id="imp" class="i" rows="9"></textarea><div id="impPrev" class="muted"></div>', async function (bg) {
      var r = parse(val(bg, 'imp')); if (!r.ok.length) throw new Error('ไม่พบข้อมูลที่ใช้ได้');
      var base = S.tasks.length, now = new Date().toISOString();
      var rows = r.ok.map(function (x, i) { if (parts().indexOf(x.part) < 0) S.P.parts.push(x.part); if (cats().indexOf(x.cat) < 0) S.P.cats.push(x.cat);
        return Object.assign({ id: uid() + i, projectId: S.P.id, order: base + i + 1, pct: 0, updated: now }, x); });
      await saveProject(); await DB.putMany('tasks', rows); S.tasks = S.tasks.concat(rows);
      toast('เพิ่ม ' + rows.length + ' รายการ' + (r.bad.length ? ' (ข้าม ' + r.bad.length + ' แถวที่อ่านไม่ได้)' : '')); render();
    }, 'นำเข้า', true);
  var parse = function (txt) {
    var ok = [], bad = [], mp = isMulti() ? 1 : 0;
    String(txt).split(/\r?\n/).forEach(function (line, i) {
      if (!line.trim()) return; var c = line.split('\t');
      var r = { part: mp ? (c[0] || '').trim() : (parts()[0] || 'งานหลัก'), cat: (c[mp] || '').trim() || cats()[0], desc: (c[mp + 1] || '').trim(), boq: String(num(c[mp + 2]) || ''),
        weight: (c[mp + 3] || '').replace('%', '').trim(), bs: parseDateAny(c[mp + 4]), bf: parseDateAny(c[mp + 5]) };
      if (!r.part || !r.desc || !r.bs || !r.bf || r.bs === 'X' || r.bf === 'X' || r.bf < r.bs) bad.push(i + 1); else ok.push(r);
    });
    return { ok: ok, bad: bad };
  };
  bg.querySelector('#imp').oninput = function (e) { var r = parse(e.target.value); bg.querySelector('#impPrev').textContent = 'อ่านได้ ' + r.ok.length + ' แถว' + (r.bad.length ? ' • อ่านไม่ได้ ' + r.bad.length + ' แถว (แถวที่ ' + r.bad.slice(0, 6).join(', ') + ')' : ''); };
}

/* ---------------- PROJECT SETTINGS ---------------- */
async function vProjSet() {
  var p = S.P;
  after(function () { var box = $('#projFormBox'); if (box) wireProjectForm(box); });
  return pageHead('ตั้งค่าโครงการ', 'ข้อมูลสัญญา ผู้เกี่ยวข้อง งานส่วน และหมวดงาน', '') + '<div class="card" id="projFormBox"><h2>ข้อมูลโครงการ</h2>' + projectForm(p) +
    '<div class="row" style="margin-top:14px"><button class="btn" data-act="saveProj">บันทึก</button></div></div>' +
    '<div class="card"><h2>ส่งออกและสำรองข้อมูล</h2><div class="row"><button class="btn" data-act="exportV4">' + ic('excel') + 'รายงาน Excel (รูปแบบ v4)</button><button class="btn sec" data-act="exportXlsx">' + ic('download') + 'ข้อมูลดิบ Excel</button><button class="btn sec" data-act="backup">' + ic('backup') + 'สำรองข้อมูลทั้งหมด</button></div>' +
    '<p class="muted"><b>รายงาน Excel (รูปแบบ v4)</b> – ไฟล์ควบคุมงานฉบับเต็ม 13–14 ชีต (Dashboard, รายงาน, Gantt, S-Curve, งวดงาน, เงินงวด, VO, ขยายเวลา, วัสดุ ฯลฯ) พร้อมสูตรและกราฟ คำนวณใหม่เมื่อเปิดใน Excel • <b>ข้อมูลดิบ</b> – ตารางข้อมูลสำหรับวิเคราะห์ต่อ • ทั้งสองแบบนำเข้ากลับเป็นโครงการใหม่ได้</p></div>' +
    '<div class="card"><h2>จัดการโครงการ</h2><div class="row"><button class="btn sec" data-act="archive">' + (p.archived ? 'นำออกจากคลัง' : 'เก็บเข้าคลัง (โครงการจบแล้ว)') + '</button>' +
    '<button class="btn bad" data-act="delProject">ลบโครงการ</button></div><p class="muted">ลบโครงการจะลบรายการงาน ประวัติผลงาน รายงาน รูปภาพ และรายการวัสดุของโครงการนี้ทั้งหมด (กู้คืนได้จากไฟล์สำรองเท่านั้น)</p></div>';
}

/* ---------------- DAILY REPORT ---------------- */
var WEATHER = ['แจ่มใส', 'มีเมฆ', 'ฝนเล็กน้อย', 'ฝนตกหนัก'];
function wx(v) { return String(v || '').replace(/^[^\u0E00-\u0E7F]+/, ''); }
var WORK_ST = ['ทำงานได้ตามปกติ', 'ทำงานได้บางส่วน', 'หยุดงาน (ฝนตก)', 'หยุดงาน (วันหยุด/อื่นๆ)'];
var TRADES = ['โฟร์แมน', 'ช่างไม้', 'ช่างเหล็ก', 'ช่างปูน', 'ช่างไฟฟ้า', 'ช่างประปา', 'ช่างเชื่อม', 'ช่างทาสี', 'กรรมกร'];
function dailyOf(dIso) { return S.daily.filter(function (x) { return x.date === dIso; })[0]; }
function manTotal(r) { return (r && r.manpower || []).reduce(function (a, x) { return a + num(x.count); }, 0); }
function isWorkDay(r) { return r && /^ทำงาน/.test(r.status || WORK_ST[0]); }
async function vDaily(args) {
  var pid = S.P.id;
  if (args[0]) return dailyEditor(args[0]);
  var list = S.daily.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  var h = pageHead('รายงานประจำวัน', 'บันทึกการปฏิบัติงานประจำวันของผู้ควบคุมงาน • บันทึกอัตโนมัติขณะพิมพ์', '<input type="date" class="i" id="dPick" value="' + iso(today()) + '" style="width:170px" aria-label="เลือกวันที่"><button class="btn" data-act="openDay">' + ic('plus') + 'เปิด / สร้างรายงาน</button>');
  if (!list.length) return h + '<div class="card empty">ยังไม่มีรายงานประจำวัน – เลือกวันที่แล้วกด "เปิด / สร้าง"</div>';
  var month = '';
  list.forEach(function (r) {
    var d = D(r.date), m = TM[d.getMonth()] + ' ' + (d.getFullYear() + 543);
    if (m !== month) { h += '<div class="h3">' + m + '</div>'; month = m; }
    var ph = filesOf('daily', r.date).length, pc = S.progress.filter(function (x) { return x.date === r.date && x.source === 'daily'; }).length;
    h += '<div class="item pcard" data-go="/p/' + pid + '/daily/' + r.date + '" tabindex="0"><div class="between"><div><span class="t">' + TDAY[d.getDay()] + ' ' + th(r.date) + '</span>' +
      '<div class="m">' + esc((r.weatherAM || '').split(' ')[0] + ' ' + (r.weatherPM || '').split(' ')[0]) + ' ' + esc(r.status || '') + ' • คนงาน ' + manTotal(r) + ' คน' + (pc ? ' • อัปเดตผลงาน ' + pc + ' รายการ' : '') + (ph ? ' • ' + ph : '') + '</div></div>' +
      '<span class="muted">›</span></div>' + (r.work ? '<div class="m" style="margin-top:4px">' + esc(r.work.slice(0, 140)) + (r.work.length > 140 ? '…' : '') + '</div>' : '') + '</div>';
  });
  return h;
}
function listRows(key, arr, nameLab) {
  return '<div id="' + key + 'Rows">' + (arr || []).map(function (x, i) {
    return '<div class="lrow"><input class="i" data-l="' + key + '" data-i="' + i + '" data-f="n" value="' + esc(x.trade || x.name) + '" placeholder="' + nameLab + '" aria-label="' + nameLab + '">' +
      '<input class="i" data-l="' + key + '" data-i="' + i + '" data-f="c" type="number" min="0" inputmode="numeric" value="' + esc(x.count) + '" aria-label="จำนวน">' +
      '<button class="xbtn" data-ldel="' + key + '" data-i="' + i + '" aria-label="ลบแถว">✕</button></div>'; }).join('') + '</div>';
}
function activeTasksOn(dIso) {
  var d = D(dIso);
  return wbsList().filter(function (o) { var t = o.t, s = D(t.rs || t.bs), f = D(t.rf || t.bf);
    if (t.af && t.af < dIso) return false;
    return (t.as && t.as <= dIso) || (s && s <= addDays(d, 7) && f && f >= addDays(d, -30)) || S.progress.some(function (x) { return x.taskId === t.id && x.date === dIso; }); });
}
async function dailyEditor(dIso) {
  if (!D(dIso)) throw new Error('วันที่ไม่ถูกต้อง');
  var r = dailyOf(dIso), pid = S.P.id, d = D(dIso), hist = histIndex();
  var draft = r ? Object.assign({}, r, { weatherAM: wx(r.weatherAM), weatherPM: wx(r.weatherPM) }) : { id: pid + '_' + dIso, projectId: pid, date: dIso, weatherAM: WEATHER[0], weatherPM: WEATHER[0], status: WORK_ST[0], manpower: [], machinery: [] };
  S.dailyDraft = JSON.parse(JSON.stringify(draft)); S.dailySaved = !!r;
  var prev = S.daily.filter(function (x) { return x.date < dIso; }).sort(function (a, b) { return a.date < b.date ? 1 : -1; })[0];
  var act = activeTasksOn(dIso);
  var dayBefore = iso(addDays(d, -1));
  var sel = function (id, list, v) { return '<select id="' + id + '" class="i" data-dd="' + id + '">' + opts(list, v) + '</select>'; };
  var ta = function (k, lab, ph) { return '<label class="f" for="d_' + k + '">' + lab + '</label><textarea id="d_' + k + '" class="i" data-dd="' + k + '" rows="3" placeholder="' + (ph || '') + '">' + esc(draft[k]) + '</textarea>'; };
  var h = '<div class="card noprint"><div class="between"><div class="row"><button class="btn sm sec" data-go="/p/' + pid + '/daily/' + iso(addDays(d, -1)) + '" aria-label="วันก่อนหน้า">‹</button>' +
    '<div><div class="h2" style="margin:0">' + TDAY[d.getDay()] + ' ' + th(dIso) + '</div><div class="muted">สัปดาห์ที่ ' + weekOf(d) + ' • วันที่ ' + (diffDays(d, projStart()) + 1) + ' ของสัญญา</div></div>' +
    '<button class="btn sm sec" data-go="/p/' + pid + '/daily/' + iso(addDays(d, 1)) + '" aria-label="วันถัดไป">›</button></div>' +
    '<div class="row"><span id="saveState" class="muted">' + (r ? '✓ บันทึกแล้ว' : 'ยังไม่บันทึก') + '</span><button class="btn sm sec" data-go="/p/' + pid + '/daily">รายการ</button>' +
    '<button class="btn sm sec" data-act="printDaily" data-date="' + dIso + '">พิมพ์</button>' + (r ? '<button class="btn sm ghost bad-t" data-act="delDaily" data-date="' + dIso + '">ลบ</button>' : '') + '</div></div></div>';
  h += '<div class="card"><h2>สภาพอากาศและการทำงาน</h2><div class="grid3"><div><label class="f" for="weatherAM">ช่วงเช้า</label>' + sel('weatherAM', WEATHER, draft.weatherAM) + '</div>' +
    '<div><label class="f" for="weatherPM">ช่วงบ่าย</label>' + sel('weatherPM', WEATHER, draft.weatherPM) + '</div><div><label class="f" for="status">สถานะการทำงาน</label>' + sel('status', WORK_ST, draft.status) + '</div></div></div>';
  h += '<div class="card"><div class="between"><h2 style="margin:0">คนงาน <span class="muted" id="manSum">รวม ' + manTotal(draft) + ' คน</span></h2>' +
    (prev ? '<button class="btn sm sec" data-act="copyPrev" data-date="' + prev.date + '">คัดลอกจาก ' + th(prev.date, true) + '</button>' : '') + '</div>' +
    listRows('manpower', draft.manpower, 'ประเภทช่าง') + '<div class="chips" style="margin-top:6px">' + TRADES.map(function (x) { return '<button class="chip" data-addrow="manpower" data-name="' + x + '">＋ ' + x + '</button>'; }).join('') + '</div>' +
    '<h2 style="margin:16px 0 6px">เครื่องจักร / เครื่องมือ</h2>' + listRows('machinery', draft.machinery, 'ชื่อเครื่องจักร') +
    '<button class="btn sm sec" data-addrow="machinery" data-name="">＋ เพิ่มเครื่องจักร</button></div>';
  h += '<div class="card"><h2>ผลงานรายรายการ ณ วันนี้</h2><p class="muted">แก้ % ของรายการที่ทำวันนี้ – ระบบบันทึกเป็นประวัติผลงานของวันที่ ' + th(dIso, true) + ' ทันที (ใช้สร้าง S-Curve)</p>' +
    (act.length ? '<div class="tw"><table><tr><th>รายการ</th><th class="num">เมื่อวาน</th><th class="num" style="width:110px">วันนี้ (%)</th></tr>' + act.map(function (o) {
      var t = o.t, y = taskPctAt(hist, t.id, dayBefore), n = taskPctAt(hist, t.id, dIso), ch = S.progress.some(function (x) { return x.taskId === t.id && x.date === dIso; });
      return '<tr><td><span class="muted">' + esc(o.wbs) + '</span> ' + esc(t.desc) + (isMulti() ? '<div class="muted">' + esc(t.part) + '</div>' : '') + '</td><td class="num">' + y + '%</td>' +
        '<td><input class="i" type="number" min="0" max="100" inputmode="numeric" data-dp="' + t.id + '" value="' + n + '" aria-label="% วันนี้" style="' + (ch ? 'border-color:var(--pri2);font-weight:700' : '') + '"></td></tr>'; }).join('') + '</table></div>' :
      '<p class="muted">ไม่มีรายการที่อยู่ในช่วงดำเนินการ</p>') +
    '<button class="btn sm ghost" data-go="/p/' + pid + '/tasks">ดูรายการงานทั้งหมด ›</button></div>';
  h += '<div class="card"><h2>บันทึกการปฏิบัติงาน</h2>' + ta('work', 'งานที่ดำเนินการวันนี้', 'เช่น ตอกเสาเข็มอาคาร 6 ต้น (แนว C) • เทคอนกรีตฐานราก F1 จำนวน 12 ลบ.ม.') +
    '<div class="grid2"><div>' + ta('materials', 'วัสดุเข้าหน่วยงาน', 'เช่น เหล็ก DB16 5 ตัน') + '</div><div>' + ta('tests', 'การทดสอบ / ตรวจสอบ', 'เช่น เก็บตัวอย่างคอนกรีต 6 ก้อน') + '</div>' +
    '<div>' + ta('issues', 'ปัญหา อุปสรรค', '') + '</div><div>' + ta('instructions', 'คำสั่ง / ข้อแนะนำของผู้ควบคุมงาน', '') + '</div></div>' +
    '<div class="grid2"><div>' + ta('visitors', 'ผู้เข้าตรวจ / ประชุม', '') + '</div><div>' + ta('safety', 'ความปลอดภัย / สิ่งแวดล้อม', '') + '</div></div></div>';
  h += '<div class="card"><h2>รูปถ่ายประจำวัน (' + filesOf('daily', dIso).length + ')</h2>' + filesBlock('daily', dIso, true, false) + '</div>';
  return h;
}
var _dTimer = null;
function dailyChanged() {
  var st = $('#saveState'); if (st) st.textContent = 'กำลังบันทึก…';
  clearTimeout(_dTimer); _dTimer = setTimeout(saveDaily, 600);
}
async function saveDaily() {
  var dr = S.dailyDraft; if (!dr) return;
  dr.manpower = (dr.manpower || []).filter(function (x) { return (x.trade || '').trim() || num(x.count); });
  dr.machinery = (dr.machinery || []).filter(function (x) { return (x.name || '').trim() || num(x.count); });
  dr.updated = new Date().toISOString();
  await DB.put('daily', JSON.parse(JSON.stringify(dr)));
  var i = S.daily.findIndex(function (x) { return x.id === dr.id; }); if (i >= 0) S.daily[i] = JSON.parse(JSON.stringify(dr)); else S.daily.push(JSON.parse(JSON.stringify(dr)));
  S.dailySaved = true; var st = $('#saveState'); if (st) st.textContent = '✓ บันทึกแล้ว';
}
async function setDailyProgress(taskId, dIso, p) {
  var t = taskById(taskId); if (!t) return;
  if (p < 0 || p > 100 || isNaN(p)) throw new Error('% ต้องอยู่ระหว่าง 0–100');
  if (D(dIso) > today()) throw new Error('บันทึกผลงานล่วงหน้าไม่ได้');
  var ex = S.progress.filter(function (x) { return x.taskId === taskId && x.date === dIso && x.source === 'daily'; })[0];
  if (ex) { ex.pct = p; ex.ts = Date.now(); await DB.put('progress', ex); await syncTaskPct(t); }
  else await recordProgress(t, dIso, p, '', 'daily');
  if (!S.dailySaved) await saveDaily();
}

/* ---------------- WEEKLY REPORT ---------------- */
function weekStats(n) {
  var r = weekRange(n), a = iso(r.start), b = iso(r.end), hist = histIndex();
  var days = S.daily.filter(function (x) { return x.date >= a && x.date <= b; }).sort(function (x, y) { return x.date < y.date ? -1 : 1; });
  var men = days.map(manTotal), work = days.filter(isWorkDay).length, rain = days.filter(function (x) { return /ฝน/.test(x.status || ''); }).length;
  var mach = {}; days.forEach(function (x) { (x.machinery || []).forEach(function (m) { if (!m.name) return; mach[m.name] = Math.max(mach[m.name] || 0, num(m.count) || 1); }); });
  var endD = r.end > today() ? today() : r.end, prevEnd = addDays(r.start, -1);
  var plan = planAt(r.end), act = actualAt(endD, hist), actPrev = actualAt(prevEnd, hist);
  var moved = wbsList().map(function (o) { return { o: o, from: taskPctAt(hist, o.t.id, iso(prevEnd)), to: taskPctAt(hist, o.t.id, iso(endD)) }; }).filter(function (x) { return x.to !== x.from; });
  var photos = S.files.filter(function (f) { return f.kind === 'daily' && f.ref >= a && f.ref <= b && f.mime !== 'application/pdf'; }).sort(function (x, y) { return x.ref < y.ref ? -1 : 1; });
  return { r: r, days: days, menAvg: men.length ? men.reduce(function (x, y) { return x + y; }, 0) / men.length : 0, menMax: men.length ? Math.max.apply(null, men) : 0,
    manDays: men.reduce(function (x, y) { return x + y; }, 0), work: work, rain: rain, mach: mach, plan: plan, act: act, actPrev: actPrev, moved: moved, photos: photos, partial: r.end > today() };
}
function compileText(st, key) {
  return st.days.filter(function (x) { return (x[key] || '').trim(); }).map(function (x) { return th(x.date, true) + ': ' + x[key].trim(); }).join('\n');
}
function weekRec(n) { return S.weekly.filter(function (w) { return String(w.week) === String(n); })[0]; }
async function vWeekly(args) {
  var pid = S.P.id;
  if (args[0]) return weeklyEditor(+args[0]);
  var cur = weekOf(today()), last = Math.min(Math.max(cur, 1), totalWeeks() + 8);
  var h = pageHead('รายงานรายสัปดาห์', 'รวบรวมจากรายงานประจำวันและประวัติผลงาน • พิมพ์เป็นบันทึกข้อความเสนอคณะกรรมการตรวจรับพัสดุ', '');
  for (var n = last; n >= 1; n--) {
    var r = weekRange(n), a = iso(r.start), b = iso(r.end), nd = S.daily.filter(function (x) { return x.date >= a && x.date <= b; }).length, w = weekRec(n);
    h += '<div class="item pcard" data-go="/p/' + pid + '/weekly/' + n + '" tabindex="0"><div class="between"><div><span class="t">สัปดาห์ที่ ' + n + '</span> <span class="muted">' + th(r.start, true) + ' – ' + th(r.end, true) + '</span>' +
      '<div class="m">รายงานประจำวัน ' + nd + ' วัน' + (n === cur ? ' • สัปดาห์ปัจจุบัน' : '') + '</div></div>' + (w && w.final ? badge({ k: 'ok', t: 'จัดทำแล้ว' }) : w ? badge({ k: 'warn', t: 'ร่าง' }) : nd ? badge({ k: 'na', t: 'ยังไม่จัดทำ' }) : '') + '</div></div>';
  }
  return h;
}
async function weeklyEditor(n) {
  if (!(n >= 1)) throw new Error('สัปดาห์ไม่ถูกต้อง');
  var st = weekStats(n), pid = S.P.id, w = weekRec(n) || { id: pid + '_w' + n, projectId: pid, week: n, photos: null };
  S.weekDraft = JSON.parse(JSON.stringify(w));
  var selPhotos = w.photos || st.photos.slice(0, 12).map(function (f) { return f.id; });
  S.weekDraft.photos = selPhotos;
  var ta = function (k, lab, rows, fill) { return '<div class="between"><label class="f" for="w_' + k + '">' + lab + '</label>' + (fill ? '<button class="btn sm ghost" data-fill="' + k + '">↺ ดึงจากรายงานประจำวัน</button>' : '') + '</div>' +
    '<textarea id="w_' + k + '" class="i" data-wd="' + k + '" rows="' + (rows || 4) + '">' + esc(w[k] != null ? w[k] : (fill ? compileText(st, fill) : '')) + '</textarea>'; };
  if (w.work_done == null) { S.weekDraft.work_done = compileText(st, 'work'); S.weekDraft.issues = compileText(st, 'issues'); S.weekDraft.materials = compileText(st, 'materials') + (compileText(st, 'tests') ? '\n' + compileText(st, 'tests') : ''); }
  var h = '<div class="card noprint"><div class="between"><div class="row"><button class="btn sm sec" data-go="/p/' + pid + '/weekly/' + Math.max(1, n - 1) + '" aria-label="สัปดาห์ก่อน">‹</button>' +
    '<div><div class="h2" style="margin:0">สัปดาห์ที่ ' + n + '</div><div class="muted">' + th(st.r.start) + ' – ' + th(st.r.end) + (st.partial ? ' (ยังไม่ครบสัปดาห์)' : '') + '</div></div>' +
    '<button class="btn sm sec" data-go="/p/' + pid + '/weekly/' + (n + 1) + '" aria-label="สัปดาห์ถัดไป">›</button></div>' +
    '<div class="row"><span id="saveState" class="muted">' + (weekRec(n) ? '✓ บันทึกแล้ว' : 'ยังไม่บันทึก') + '</span><button class="btn sm sec" data-go="/p/' + pid + '/weekly">รายการ</button>' +
    '<button class="btn sm" data-act="printWeekly" data-week="' + n + '">พิมพ์บันทึกข้อความ</button></div></div></div>';
  h += '<div class="card"><h2>สรุปอัตโนมัติ</h2><div class="kpis">' +
    kpi('ผลงานตามแผนสะสม', pct(st.plan), 'ณ สิ้นสัปดาห์') + kpi('ผลงานจริงสะสม', pct(st.act), 'สัปดาห์นี้ +' + pct(st.act - st.actPrev), st.act >= st.plan ? 'ok-t' : 'bad-t') +
    kpi('เร็ว/ช้ากว่าแผน', (st.act - st.plan >= 0 ? '+' : '') + pct(st.act - st.plan), Math.round((st.act - st.plan) * projDur()) + ' วัน', st.act >= st.plan ? 'ok-t' : 'bad-t') +
    kpi('วันทำงาน', st.work + ' / ' + st.days.length + ' วัน', 'ฝนตกหยุดงาน ' + st.rain + ' วัน') + kpi('คนงานเฉลี่ย', st.menAvg.toFixed(1) + ' คน/วัน', 'สูงสุด ' + st.menMax + ' • รวม ' + st.manDays + ' แรง') + '</div>' +
    (st.days.length ? '' : '<p class="warn-t">ยังไม่มีรายงานประจำวันในสัปดาห์นี้ – สถิติคนงาน/สภาพอากาศจะว่าง</p>') +
    (st.moved.length ? '<div class="h3">รายการที่มีความก้าวหน้าในสัปดาห์นี้</div><div class="tw"><table><tr><th>รายการ</th><th class="num">ต้นสัปดาห์</th><th class="num">สิ้นสัปดาห์</th></tr>' +
      st.moved.map(function (x) { return '<tr><td><span class="muted">' + esc(x.o.wbs) + '</span> ' + esc(x.o.t.desc) + '</td><td class="num">' + x.from + '%</td><td class="num"><b>' + x.to + '%</b></td></tr>'; }).join('') + '</table></div>' : '') + '</div>';
  h += '<div class="card"><h2>เนื้อหารายงาน</h2>' + ta('work_done', 'งานที่ดำเนินการในสัปดาห์นี้', 6, 'work') + ta('next_plan', 'แผนงานสัปดาห์หน้า', 4) +
    '<div class="grid2"><div>' + ta('materials', 'วัสดุเข้าหน่วยงาน / การทดสอบ', 4, 'materials') + '</div><div>' + ta('issues', 'ปัญหา อุปสรรค', 4, 'issues') + '</div></div>' +
    ta('opinion', 'ความเห็นของผู้ควบคุมงาน', 3) +
    '<label class="row" style="margin-top:10px"><input type="checkbox" data-wd="final" ' + (w.final ? 'checked' : '') + '><span>จัดทำรายงานสัปดาห์นี้เสร็จแล้ว</span></label></div>';
  h += '<div class="card"><h2>รูปถ่ายแนบรายงาน (' + selPhotos.length + ' จาก ' + st.photos.length + ')</h2>' +
    (st.photos.length ? '<p class="muted">แตะรูปเพื่อเลือก/ไม่เลือก – รูปที่เลือกจะอยู่ในภาคผนวกของบันทึกข้อความ</p><div class="files">' + st.photos.map(function (f) {
      var on = selPhotos.indexOf(f.id) >= 0;
      return '<div class="fcard" style="' + (on ? 'outline:3px solid var(--pri2)' : 'opacity:.55') + '"><div class="fthumb" data-fimg="' + f.id + '" data-wph="' + f.id + '" role="checkbox" aria-checked="' + on + '" tabindex="0"></div><div class="fcap">' + (on ? '✓ ' : '') + th(f.ref, true) + (f.caption ? ' • ' + esc(f.caption) : '') + '</div></div>'; }).join('') + '</div>' :
      '<p class="muted">ยังไม่มีรูปในรายงานประจำวันของสัปดาห์นี้</p>') + '</div>';
  return h;
}
var _wTimer = null;
function weeklyChanged() { var st = $('#saveState'); if (st) st.textContent = 'กำลังบันทึก…'; clearTimeout(_wTimer); _wTimer = setTimeout(saveWeekly, 600); }
async function saveWeekly() {
  var w = S.weekDraft; if (!w) return; w.updated = new Date().toISOString();
  await DB.put('weekly', JSON.parse(JSON.stringify(w)));
  var i = S.weekly.findIndex(function (x) { return x.id === w.id; }); if (i >= 0) S.weekly[i] = JSON.parse(JSON.stringify(w)); else S.weekly.push(JSON.parse(JSON.stringify(w)));
  var st = $('#saveState'); if (st) st.textContent = '✓ บันทึกแล้ว';
}

/* ---------------- PRINT DOCUMENTS ---------------- */
async function vPrint(args) {
  var kind = args[0], key = args[1], back = kind === 'daily' ? '/daily/' + key : kind === 'weekly' ? '/weekly/' + key : '/mat/' + key;
  var bar = '<div class="card noprint"><div class="row"><button class="btn sm sec" data-go="/p/' + S.P.id + back + '">← กลับ</button><button class="btn" data-act="print">พิมพ์ / บันทึกเป็น PDF</button>' +
    '<span class="muted">เลือกเครื่องพิมพ์ "บันทึกเป็น PDF" เพื่อได้ไฟล์ส่งต่อ</span></div></div>';
  if (kind === 'daily') return bar + docDaily(key);
  if (kind === 'weekly') { after(function () { drawCurve($('#wcurve'), weekRange(+key).end > today() ? today() : weekRange(+key).end); }); return bar + docWeekly(+key); }
  if (kind === 'mat') return bar + docMat(key);
  if (kind === 'pay') return bar + docPay(key);
  if (kind === 'dash') return bar + docDash();
  return bar;
}
function docHead(title) {
  var p = S.P;
  return '<table style="margin-bottom:10px"><tr><td style="width:24%">โครงการ</td><td colspan="3"><b>' + esc(p.name) + '</b></td></tr>' +
    '<tr><td>ผู้รับจ้าง</td><td>' + esc(p.contractor || '-') + '</td><td style="width:18%">เลขที่สัญญา</td><td>' + esc(p.contract_no || '-') + '</td></tr>' +
    '<tr><td>ระยะเวลาสัญญา</td><td>' + th(projStart(), true) + ' – ' + th(projEnd(), true) + ' (' + (projDur() + eotTotal()) + ' วัน)</td><td>ผู้ว่าจ้าง</td><td>' + esc(p.employer || '-') + '</td></tr></table>';
}
function photoGrid(list, label) {
  if (!list.length) return '';
  return '<div class="pgrid">' + list.map(function (f, i) { return '<figure><img data-fimg="' + f.id + '" alt=""><figcaption>' + label + ' ' + (i + 1) + (f.ref && /^\d{4}-/.test(f.ref) ? ' (' + th(f.ref, true) + ')' : '') + (f.caption ? ' ' + esc(f.caption) : '') + '</figcaption></figure>'; }).join('') + '</div>';
}
function docDaily(dIso) {
  var r = dailyOf(dIso) || { manpower: [], machinery: [] }, d = D(dIso), p = S.P, hist = histIndex(), prev = iso(addDays(d, -1));
  var moved = wbsList().map(function (o) { return { o: o, from: taskPctAt(hist, o.t.id, prev), to: taskPctAt(hist, o.t.id, dIso) }; }).filter(function (x) { return x.to !== x.from; });
  var box = function (lab, v) { return '<h3>' + lab + '</h3><div class="box">' + esc(v || '-') + '</div>'; };
  return '<div class="doc"><h1>บันทึกการปฏิบัติงานประจำวันของผู้ควบคุมงาน</h1><p style="text-align:center;margin-top:-4px">' + esc(p.org || '') + '</p>' + docHead() +
    '<table><tr><td style="width:24%">วันที่</td><td><b>' + TDAY[d.getDay()] + ' ' + th(dIso) + '</b></td><td style="width:18%">วันที่ของสัญญา</td><td>' + (diffDays(d, projStart()) + 1) + ' / ' + (projDur() + eotTotal()) + '</td></tr>' +
    '<tr><td>สภาพอากาศ</td><td>เช้า ' + esc(r.weatherAM || '-') + ' • บ่าย ' + esc(r.weatherPM || '-') + '</td><td>การทำงาน</td><td>' + esc(r.status || '-') + '</td></tr></table>' +
    '<h3>คนงานและเครื่องจักร</h3><div class="pgrid" style="gap:10px"><table><tr><th>ประเภทช่าง</th><th class="num">จำนวน (คน)</th></tr>' + ((r.manpower || []).map(function (x) { return '<tr><td>' + esc(x.trade) + '</td><td class="num">' + num(x.count) + '</td></tr>'; }).join('') || '<tr><td colspan="2">-</td></tr>') +
    '<tr><th>รวม</th><th class="num">' + manTotal(r) + '</th></tr></table><table><tr><th>เครื่องจักร / เครื่องมือ</th><th class="num">จำนวน</th></tr>' + ((r.machinery || []).map(function (x) { return '<tr><td>' + esc(x.name) + '</td><td class="num">' + num(x.count) + '</td></tr>'; }).join('') || '<tr><td colspan="2">-</td></tr>') + '</table></div>' +
    box('งานที่ดำเนินการ', r.work) +
    (moved.length ? '<h3>ความก้าวหน้ารายรายการ</h3><table><tr><th>รายการ</th><th class="num">ก่อนหน้า</th><th class="num">วันนี้</th></tr>' + moved.map(function (x) { return '<tr><td>' + esc(x.o.wbs + ' ' + x.o.t.desc) + '</td><td class="num">' + x.from + '%</td><td class="num">' + x.to + '%</td></tr>'; }).join('') + '</table>' : '') +
    box('วัสดุเข้าหน่วยงาน', r.materials) + box('การทดสอบ / ตรวจสอบ', r.tests) + box('ปัญหา อุปสรรค', r.issues) + box('คำสั่ง / ข้อแนะนำของผู้ควบคุมงาน', r.instructions) +
    ((r.visitors || r.safety) ? box('ผู้เข้าตรวจ / ประชุม', r.visitors) + box('ความปลอดภัย / สิ่งแวดล้อม', r.safety) : '') +
    '<div class="sig1">ลงชื่อ ..........................................<br>(' + esc(p.supervisor_name || '..........................................') + ')<br>' + esc(p.supervisor_pos || 'ผู้ควบคุมงาน') + '</div>' +
    (filesOf('daily', dIso).length ? '<div class="pb"></div><h3>ภาพถ่ายประจำวันที่ ' + th(dIso) + '</h3>' + photoGrid(filesOf('daily', dIso).filter(function (f) { return f.mime !== 'application/pdf'; }), 'รูปที่') : '') + '</div>';
}
function docWeekly(n) {
  var st = weekStats(n), w = weekRec(n) || {}, p = S.P, r = st.r;
  var status = st.act >= st.plan ? 'เป็นไปตามแผน / เร็วกว่าแผน' : (st.plan && st.act / st.plan >= 0.9 ? 'ล่าช้ากว่าแผนเล็กน้อย' : 'ล่าช้ากว่าแผนมาก');
  var el = diffDays(r.end, projStart()) + 1, tot = diffDays(projEnd(), projStart()) + 1, remD = diffDays(projEnd(), r.end);
  var photos = (w.photos || st.photos.slice(0, 12).map(function (f) { return f.id; })).map(function (id) { return S.files.filter(function (f) { return f.id === id; })[0]; }).filter(Boolean);
  var box = function (t) { return '<div class="box">' + esc(t || '-') + '</div>'; };
  var subs = S.submittals.filter(function (s) { return s.status !== 'อนุมัติ'; }).slice(0, 8);
  var nxt = wbsList().filter(function (o) { var t = o.t; if (t.af) return false; var s = D(t.rs || t.bs); return t.as || (s && diffDays(s, r.end) <= 14); }).slice(0, 10);
  return '<div class="doc"><h1>บันทึกข้อความ</h1><div class="mh"><b>ส่วนราชการ</b><div>' + esc(p.org || '-') + '</div><b>ที่</b><div>' + esc(p.doc_prefix || '-') + ' &nbsp; <b>วันที่</b> ' + th(today()) + '</div>' +
    '<b>เรื่อง</b><div>รายงานผลการปฏิบัติงานของผู้รับจ้าง ประจำสัปดาห์ที่ ' + n + ' (' + th(r.start, true) + ' – ' + th(r.end, true) + ')</div><b>เรียน</b><div>ประธานกรรมการตรวจรับพัสดุ</div></div>' +
    '<p class="para">ตามที่ ' + esc(p.employer || '(ผู้ว่าจ้าง)') + ' ได้ทำสัญญาจ้าง ' + esc(p.contractor || '(ผู้รับจ้าง)') + ' ดำเนินการ' + esc(p.name) + ' ตามสัญญาเลขที่ ' + esc(p.contract_no || '……') +
    ' ลงวันที่ ' + (p.contract_date ? th(p.contract_date) : '……') + (num(p.bac) ? ' วงเงิน ' + money(p.bac) + ' บาท' : '') + ' ระยะเวลา ' + projDur() + ' วัน เริ่มสัญญาวันที่ ' + th(projStart()) + ' สิ้นสุดสัญญาวันที่ ' + th(projEnd()) +
    (eotTotal() ? ' (รวมขยายเวลา ' + eotTotal() + ' วัน)' : '') + (voNet() ? ' มูลค่าสัญญาปัจจุบันรวมงานเพิ่ม-ลด ' + money(num(p.bac) + voNet()) + ' บาท' : '') + ' นั้น</p><p class="para">ข้าพเจ้าในฐานะผู้ควบคุมงาน ขอรายงานผลการปฏิบัติงานของผู้รับจ้าง ประจำสัปดาห์ที่ ' + n + ' ดังนี้</p>' +
    '<h3>1. ความก้าวหน้าของงาน</h3><table><tr><td>ผลงานตามแผนสะสม</td><td class="num">' + pct(st.plan) + '</td><td>ผลงานจริงสะสม</td><td class="num"><b>' + pct(st.act) + '</b></td></tr>' +
    '<tr><td>เร็ว (+) / ช้า (−) กว่าแผน</td><td class="num">' + (st.act - st.plan >= 0 ? '+' : '') + pct(st.act - st.plan) + ' (' + Math.round((st.act - st.plan) * projDur()) + ' วัน)</td><td>ผลงานสัปดาห์นี้</td><td class="num">' + pct(st.act - st.actPrev) + '</td></tr>' +
    '<tr><td>ระยะเวลาดำเนินการแล้ว</td><td class="num">' + el + ' วัน (' + pct(el / tot, 1) + ')</td><td>ระยะเวลาคงเหลือ</td><td class="num">' + (remD >= 0 ? remD + ' วัน' : 'เลยกำหนด ' + (-remD) + ' วัน') + '</td></tr>' +
    '<tr><td>สถานะ</td><td colspan="3"><b>' + status + '</b></td></tr></table>' +
    '<div class="chartbox" style="height:230px;margin-top:8px"><canvas id="wcurve"></canvas></div>' +
    '<h3>2. ข้อมูลการปฏิบัติงาน</h3><table><tr><td style="width:34%">วันทำงาน</td><td>' + st.work + ' วัน จากที่บันทึก ' + st.days.length + ' วัน • หยุดเนื่องจากฝนตก ' + st.rain + ' วัน</td></tr>' +
    '<tr><td>คนงาน</td><td>เฉลี่ย ' + st.menAvg.toFixed(1) + ' คน/วัน • สูงสุด ' + st.menMax + ' คน • รวม ' + st.manDays + ' แรงงาน</td></tr>' +
    '<tr><td>เครื่องจักร</td><td>' + (Object.keys(st.mach).map(function (k) { return esc(k) + ' ' + st.mach[k]; }).join(', ') || '-') + '</td></tr></table>' +
    '<h3>3. งานที่ดำเนินการในสัปดาห์นี้</h3>' + box(w.work_done != null ? w.work_done : compileText(st, 'work')) +
    (st.moved.length ? '<table style="margin-top:6px"><tr><th>รายการที่มีความก้าวหน้า</th><th class="num">ต้นสัปดาห์</th><th class="num">สิ้นสัปดาห์</th></tr>' + st.moved.map(function (x) { return '<tr><td>' + esc(x.o.wbs + ' ' + x.o.t.desc) + '</td><td class="num">' + x.from + '%</td><td class="num">' + x.to + '%</td></tr>'; }).join('') + '</table>' : '') +
    '<h3>4. แผนงานสัปดาห์หน้า</h3>' + box(w.next_plan) +
    (nxt.length ? '<table style="margin-top:6px"><tr><th>งานที่กำลังดำเนินการ / ต้องเริ่มใน 14 วัน</th><th class="num">% ผลงาน</th><th>กำหนดเสร็จ</th></tr>' + nxt.map(function (o) { return '<tr><td>' + esc(o.wbs + ' ' + o.t.desc) + '</td><td class="num">' + num(o.t.pct) + '%</td><td>' + th(o.t.rf || o.t.bf, true) + '</td></tr>'; }).join('') + '</table>' : '') +
    '<h3>5. วัสดุเข้าหน่วยงาน / การทดสอบ</h3>' + box(w.materials != null ? w.materials : compileText(st, 'materials')) +
    '<h3>6. งวดงานและการขยายเวลา</h3>' + weeklyFinSection() +
    (subs.length ? '<h3>7. การขออนุมัติวัสดุที่ต้องติดตาม</h3><table><tr><th>เลขที่</th><th>วัสดุ</th><th>ผลพิจารณา</th><th>สถานะ</th></tr>' + subs.map(function (s) { return '<tr><td>' + esc(s.doc_no) + '</td><td>' + esc(s.material) + '</td><td>' + esc(s.status) + '</td><td>' + esc(subRisk(s).t) + '</td></tr>'; }).join('') + '</table>' : '') +
    '<h3>' + (subs.length ? 8 : 7) + '. ปัญหา อุปสรรค</h3>' + box(w.issues != null ? w.issues : compileText(st, 'issues')) + '<h3>' + (subs.length ? 9 : 8) + '. ความเห็นของผู้ควบคุมงาน</h3>' + box(w.opinion) +
    '<p class="para" style="margin-top:14px">จึงเรียนมาเพื่อโปรดทราบ</p><div class="sig1">ลงชื่อ ..........................................<br>(' + esc(p.supervisor_name || '..........................................') + ')<br>' + esc(p.supervisor_pos || 'ผู้ควบคุมงาน') + '</div>' +
    '<h3>ความเห็นของคณะกรรมการตรวจรับพัสดุ</h3><div class="box" style="min-height:60px">☐ รับทราบ &nbsp; ☐ ให้ผู้รับจ้างเร่งรัดงาน &nbsp; ☐ อื่นๆ ........................................................</div>' +
    '<div class="sig">' + [[p.chair, 'ประธานกรรมการ'], [p.member1, 'กรรมการ'], [p.member2, 'กรรมการ']].map(function (x) { return '<div>ลงชื่อ ...........................<br>(' + esc(x[0] || '...........................') + ')<br>' + x[1] + '</div>'; }).join('') + '</div>' +
    (photos.length ? '<div class="pb"></div><h3>ภาคผนวก: ภาพถ่ายประกอบรายงาน ประจำสัปดาห์ที่ ' + n + '</h3>' + photoGrid(photos, 'รูปที่') : '') + '</div>';
}

function weeklyFinSection() {
  var L = ldInfo(), list = sortedInst(), pend = S.eots.filter(function (e) { return e.status === 'รอพิจารณา'; }).reduce(function (a, e) { return a + num(e.days_claimed); }, 0);
  return (list.length ? '<table><tr><th>งวด</th><th>เนื้องาน</th><th>กำหนดเสร็จ</th><th class="num">จำนวนเงิน</th><th>สถานะ</th></tr>' + list.map(function (i) {
    return '<tr><td>' + esc(i.no) + '</td><td>' + esc(i.scope) + '</td><td>' + th(i.due, true) + '</td><td class="num">' + money(num(i.amount) + num(i.vo_amount)) + '</td><td>' + esc(instStatus(i).t) + '</td></tr>'; }).join('') + '</table>' : '<p>ยังไม่ได้บันทึกงวดงาน</p>') +
    '<p>ขยายเวลาที่อนุมัติแล้ว ' + eotTotal() + ' วัน • รอพิจารณา ' + pend + ' วัน • ค่าปรับวันละ ' + money(L.per) + ' บาท' + (L.late ? ' • <b>เลยกำหนดสัญญาแล้ว ' + L.late + ' วัน ค่าปรับ ' + money(L.incurred) + ' บาท</b>' : '') + '</p>';
}
function docDash() {
  var p = S.P, d = today(), pl = planAt(d), ac = actualNow(), L = ldInfo();
  var rows = [['ผลงานตามแผนสะสม', pct(pl)], ['ผลงานจริงสะสม', pct(ac)], ['เร็ว (+) / ช้า (−) กว่าแผน', (ac - pl >= 0 ? '+' : '') + pct(ac - pl) + ' (' + Math.round((ac - pl) * projDur()) + ' วัน)'], ['SPI', (pl ? ac / pl : 0).toFixed(2)],
    ['มูลค่าสัญญาปัจจุบัน', money(num(p.bac) + voNet()) + ' บาท'], ['วันสิ้นสุดสัญญา (รวมขยายเวลา ' + eotTotal() + ' วัน)', th(projEnd())], ['ค่าปรับคาดการณ์', L.fLd == null ? '-' : money(L.fLd) + ' บาท']];
  var pk = isMulti() ? '<h3>ความก้าวหน้ารายงานส่วน</h3><table><tr><th>งานส่วน</th><th class="num">น้ำหนัก</th><th class="num">แผน</th><th class="num">จริง</th><th>สถานะ</th></tr>' + parts().map(function (x) { var g = groupStats(function (t) { return t.part === x; }, d); return g ? '<tr><td>' + esc(x) + '</td><td class="num">' + pct(g.W, 1) + '</td><td class="num">' + pct(g.pl, 1) + '</td><td class="num">' + pct(g.ac, 1) + '</td><td>' + esc(g.st.t) + '</td></tr>' : ''; }).join('') + '</table>' : '';
  after(function () { drawCurve($('#dcurve')); });
  return '<div class="doc"><h1>สรุปสถานะโครงการ</h1><p style="text-align:center;margin-top:-4px">ข้อมูล ณ วันที่ ' + th(d) + '</p>' + docHead() +
    '<h3>ตัวชี้วัดหลัก</h3><table>' + rows.map(function (r) { return '<tr><td style="width:45%">' + r[0] + '</td><td>' + r[1] + '</td></tr>'; }).join('') + '</table>' +
    '<div class="chartbox" style="height:250px;margin-top:10px"><canvas id="dcurve"></canvas></div>' + pk +
    '<div class="sig1">ลงชื่อ ..........................................<br>(' + esc(p.supervisor_name || '..........................................') + ')<br>' + esc(p.supervisor_pos || 'ผู้ควบคุมงาน') + '</div></div>';
}

/* ---------------- MATERIAL SUBMITTALS ---------------- */
var VERD = ['ผ่าน', 'ไม่ผ่าน', 'ไม่พบข้อมูล', 'ไม่เกี่ยวข้อง'];
var SUB_ST = ['รอพิจารณา', 'ขอเอกสารเพิ่มเติม', 'อนุมัติ', 'ไม่อนุมัติ'];
function specSections() {
  if (S._secs) return S._secs; var m = {}, order = [];
  ((window.SPEC && SPEC.items) || []).forEach(function (r) { if (!m[r[0]]) { m[r[0]] = { sec: r[0], th: r[1], n: 0 }; order.push(r[0]); } m[r[0]].n++; });
  return (S._secs = order.sort().map(function (k) { return m[k]; }));
}
function specName(sec) { var x = specSections().filter(function (y) { return y.sec === sec; })[0]; return x ? x.sec + ' ' + x.th : sec; }
function specOpts(cur) {
  var divs = (window.SPEC && SPEC.divs) || {}, g = {};
  specSections().forEach(function (x) { var d = x.sec.slice(0, 2); (g[d] = g[d] || []).push(x); });
  return '<option value="">- ไม่ใช้รายการประกอบแบบ (พิมพ์ข้อกำหนดเอง) -</option>' + Object.keys(g).sort().map(function (d) {
    return '<optgroup label="' + esc(d + ' ' + (divs[d] || '')) + '">' + g[d].map(function (x) { return '<option value="' + esc(x.sec) + '"' + (x.sec === cur ? ' selected' : '') + '>' + esc(x.sec + ' ' + x.th + ' (' + x.n + ' ข้อ)') + '</option>'; }).join('') + '</optgroup>'; }).join('');
}
function criteriaOf(s) {
  if (s.spec_sec) return ((window.SPEC && SPEC.items) || []).filter(function (r) { return r[0] === s.spec_sec; })
    .map(function (r) { return { key: r[2] + '|' + r[3], cl: r[2], mat: r[3], kind: r[4], req: r[5], pg: r[6] }; });
  return String(s.criteria_text || '').split(/\r?\n/).map(function (x) { return x.trim(); }).filter(Boolean)
    .map(function (x, i) { return { key: 'c' + (i + 1), cl: String(i + 1), mat: s.material, kind: '', req: x, pg: '' }; });
}
function checkSummary(s) {
  var cr = criteriaOf(s), ch = s.checks || {}, c = { 'ผ่าน': 0, 'ไม่ผ่าน': 0, 'ไม่พบข้อมูล': 0, 'ไม่เกี่ยวข้อง': 0, none: 0 };
  cr.forEach(function (x) { var v = ch[x.key] && ch[x.key].v; if (v) c[v]++; else c.none++; });
  var rel = cr.length - c['ไม่เกี่ยวข้อง'];
  var sug = !cr.length ? null : c['ไม่ผ่าน'] ? 'ไม่อนุมัติ' : (c['ไม่พบข้อมูล'] || c.none) ? 'ขอเอกสารเพิ่มเติม' : rel ? 'อนุมัติ' : null;
  return { n: cr.length, c: c, sug: sug, done: cr.length - c.none };
}
async function vMat(args) {
  if (args[0]) return matDetail(args[0]);
  var list = S.submittals.slice().sort(function (a, b) { return (a.doc_no || '').localeCompare(b.doc_no || '', 'th'); }), pid = S.P.id;
  var cnt = function (f) { return list.filter(f).length; };
  var h = pageHead('ขออนุมัติใช้วัสดุ', 'ทะเบียนการเสนอขออนุมัติ ตรวจเทียบ' + esc((window.SPEC && SPEC.source) || 'รายการประกอบแบบ') + ' และติดตามกำหนดอนุมัติ', '<button class="btn" data-sub="new">' + ic('plus') + 'ยื่นขออนุมัติ</button>') +
    '<div class="card"><div class="kpis">' + kpi('ทั้งหมด', list.length) + kpi('อนุมัติแล้ว', cnt(function (s) { return s.status === 'อนุมัติ'; }), '', 'ok-t') +
    kpi('รอพิจารณา / ขอเอกสาร', cnt(function (s) { return s.status === 'รอพิจารณา' || s.status === 'ขอเอกสารเพิ่มเติม'; }), '', 'warn-t') +
    kpi('เสี่ยงกระทบแผนงาน', cnt(function (s) { var k = subRisk(s).k; return k === 'bad' || k === 'warn'; }), '', 'bad-t') + '</div>' +
    '<p class="muted" style="margin-top:10px">ต้องอนุมัติภายใน = วันเริ่มของรายการงานที่ใช้วัสดุ − ระยะเวลาสั่งผลิต/จัดส่ง</p></div>';
  if (!list.length) return h + '<div class="card empty">ยังไม่มีรายการขออนุมัติวัสดุ</div>';
  return h + list.map(function (s) { var r = subRisk(s), t = taskById(s.taskId), cs = checkSummary(s);
    return '<div class="item pcard" data-go="/p/' + pid + '/mat/' + s.id + '" tabindex="0"><div class="between"><div class="grow"><span class="muted">' + esc(s.doc_no) + '</span> <span class="t">' + esc(s.material) + '</span>' +
      '<div class="m">' + esc(s.brand || '') + (s.spec_sec ? ' • ' + esc(specName(s.spec_sec)) : '') + (t ? ' • ใช้กับ ' + esc(wbsOf(t.id) + ' ' + t.desc) : '') + '</div></div>' +
      '<div style="text-align:right">' + badge({ k: s.status === 'อนุมัติ' ? 'ok' : s.status === 'ไม่อนุมัติ' ? 'bad' : 'warn', t: s.status }) + '</div></div>' +
      '<div class="m" style="margin-top:4px">' + badge(r) + (r.need ? ' ต้องอนุมัติภายใน ' + th(r.need, true) : '') + ' • ตรวจแล้ว ' + cs.done + '/' + cs.n + ' ข้อ • ' + filesOf('submittal', s.id).length + '</div></div>'; }).join('');
}
function openSub(id) {
  var s = id ? S.submittals.filter(function (x) { return x.id === id; })[0] : { status: 'รอพิจารณา', submitted_date: iso(today()), lead_days: 14 };
  var bg = modal('<h2>' + (id ? 'แก้ไขข้อมูลการขออนุมัติ' : 'ยื่นขออนุมัติใช้วัสดุ') + '</h2><div class="grid2">' + inp('sDoc', 'เลขที่เอกสาร', s.doc_no) + inp('sSubD', 'วันที่ยื่น', s.submitted_date, 'date') +
    inp('sMat', 'รายการวัสดุ', s.material) + inp('sBr', 'ยี่ห้อ / รุ่นที่เสนอ', s.brand) + '</div>' +
    '<label class="f" for="sTask">ใช้กับรายการงาน (ใช้คำนวณกำหนดอนุมัติ)</label><select id="sTask" class="i">' + opts(wbsList().map(function (o) { return [o.t.id, o.wbs + ' ' + o.t.desc]; }), s.taskId, '- ไม่ระบุ -') + '</select>' +
    '<div class="grid2">' + inp('sLead', 'ระยะเวลาสั่งผลิต/จัดส่ง (วัน)', s.lead_days, 'number', 'min="0" inputmode="numeric"') + '</div>' +
    '<label class="f" for="sSpec">เกณฑ์ตรวจตามรายการประกอบแบบ</label><select id="sSpec" class="i">' + specOpts(s.spec_sec) + '</select>' +
    '<label class="f" for="sCrit">หรือพิมพ์ข้อกำหนดเอง (บรรทัดละ 1 ข้อ) – ใช้เมื่อไม่เลือกหมวด</label><textarea id="sCrit" class="i" rows="3" placeholder="เช่น เหล็กข้ออ้อย SD40 ตาม มอก. 24-2559&#10;มีใบรับรองผลการทดสอบ (Mill Certificate)">' + esc(s.criteria_text) + '</textarea>' +
    (id ? '<div style="margin-top:8px"><button class="btn sm bad" id="sDel">ลบรายการนี้</button></div>' : ''),
    async function (bg) {
      var o = Object.assign({}, s, { id: id || uid(), projectId: S.P.id, doc_no: val(bg, 'sDoc'), submitted_date: val(bg, 'sSubD'), material: val(bg, 'sMat'), brand: val(bg, 'sBr'),
        taskId: val(bg, 'sTask'), lead_days: val(bg, 'sLead'), spec_sec: val(bg, 'sSpec'), criteria_text: val(bg, 'sCrit'), updated: new Date().toISOString() });
      if (!o.doc_no || !o.material) throw new Error('กรอกเลขที่เอกสารและรายการวัสดุ');
      if (s.spec_sec && s.spec_sec !== o.spec_sec && Object.keys(s.checks || {}).length && !(await confirmBox('เปลี่ยนหมวดเกณฑ์ตรวจจะล้างผลการตรวจเดิม ดำเนินการต่อ?', 'เปลี่ยน'))) return false;
      if (s.spec_sec !== o.spec_sec) o.checks = {};
      await DB.put('submittals', o);
      if (id) Object.assign(s, o); else S.submittals.push(o);
      toast('บันทึกแล้ว'); if (!id) go('/p/' + S.P.id + '/mat/' + o.id); else render();
    }, id ? 'บันทึก' : 'ยื่นขออนุมัติ', true);
  var del = bg.querySelector('#sDel');
  if (del) del.onclick = async function () {
    if (!(await confirmBox('ลบรายการขออนุมัติ ' + s.doc_no + ' และไฟล์แนบทั้งหมด?', 'ลบ'))) return;
    var fids = filesOf('submittal', id).map(function (f) { return f.id; });
    await DB.del('submittals', id); await DB.delMany('files', fids);
    S.submittals = S.submittals.filter(function (x) { return x.id !== id; }); S.files = S.files.filter(function (f) { return fids.indexOf(f.id) < 0; });
    bg.remove(); toast('ลบแล้ว'); go('/p/' + S.P.id + '/mat');
  };
}
async function matDetail(sid) {
  S._aiCfg = await aiCfg();
  var s = S.submittals.filter(function (x) { return x.id === sid; })[0], pid = S.P.id;
  if (!s) return '<div class="card empty">ไม่พบรายการ <button class="btn sm sec" data-go="/p/' + pid + '/mat">กลับ</button></div>';
  var r = subRisk(s), t = taskById(s.taskId), cr = criteriaOf(s), cs = checkSummary(s), ch = s.checks || {};
  var h = pageHead(esc(s.doc_no) + ' • ' + esc(s.material), esc(s.brand || '') + (s.spec_sec ? ' • ' + esc(specName(s.spec_sec)) : ''),
    '<button class="btn sec" data-go="/p/' + pid + '/mat">' + ic('chevl') + 'ทะเบียน</button><button class="btn sec" data-go="/p/' + pid + '/print/mat/' + sid + '">' + ic('print') + 'รายงานขออนุมัติ</button><button class="btn" data-sub="' + sid + '">' + ic('edit') + 'แก้ไข</button>') +
    '<div class="card"><div class="kpis">' + kpi('ใช้กับงาน', t ? esc(wbsOf(t.id)) : '-', t ? esc(t.desc) : '') +
    kpi('ต้องอนุมัติภายใน', r.need ? th(r.need, true) : '-', badge(r)) + kpi('ผลการตรวจ', cs.done + ' / ' + cs.n + ' ข้อ', 'ผ่าน ' + cs.c['ผ่าน'] + ' • ไม่ผ่าน ' + cs.c['ไม่ผ่าน'] + ' • ไม่พบ ' + cs.c['ไม่พบข้อมูล']) +
    kpi('ผลพิจารณา', esc(s.status), s.approved_date ? 'เมื่อ ' + th(s.approved_date, true) : '', s.status === 'อนุมัติ' ? 'ok-t' : s.status === 'ไม่อนุมัติ' ? 'bad-t' : 'warn-t') + '</div></div>';
  h += '<div class="card"><h2>เอกสารและภาพที่แนบ</h2>' + filesBlock('submittal', sid, true, true) + '</div>' + aiCard(s, S._aiCfg || {});
  h += '<div class="card"><div class="between"><h2 style="margin:0">ตรวจเทียบข้อกำหนด (' + cr.length + ' ข้อ)</h2><div class="row">' +
    (cr.length ? '<button class="btn sm sec" data-chkall="ไม่เกี่ยวข้อง">ข้อที่ยังไม่ตรวจ = ไม่เกี่ยวข้อง</button>' : '') + '</div></div>' +
    (!cr.length ? '<p class="muted">ยังไม่ได้กำหนดเกณฑ์ – กด "แก้ไข" เพื่อเลือกหมวดตามรายการประกอบแบบ หรือพิมพ์ข้อกำหนดเอง</p>' :
      '<p class="muted">เลือกผลทีละข้อหลังเปิดดูเอกสารแนบ • ข้อที่ไม่ใช่วัสดุนี้ (เช่น วัสดุอื่นในหมวดเดียวกัน หรือขั้นตอนทำงานหน้างาน) เลือก "ไม่เกี่ยวข้อง"</p><div class="tw"><table><tr><th>ข้อ</th><th>ข้อกำหนด</th><th style="width:150px">ผล</th></tr>' +
      cr.map(function (x) { var c = ch[x.key] || {};
        return '<tr><td>' + esc(x.cl) + '</td><td>' + esc(x.req) + '<div class="muted">' + esc(x.mat) + (x.kind ? ' • ' + esc(x.kind) : '') + (x.pg ? ' • หน้า ' + esc(x.pg) : '') + '</div>' +
          '<input class="i" data-cnote="' + esc(x.key) + '" placeholder="สิ่งที่พบ / หมายเหตุ" value="' + esc(c.note) + '" style="margin-top:4px;padding:5px 8px;font-size:17px"></td>' +
          '<td><select class="i v-' + esc(c.v || '') + '" data-chk="' + esc(x.key) + '" aria-label="ผลข้อ ' + esc(x.cl) + '">' + opts(VERD, c.v, '- ยังไม่ตรวจ -') + '</select></td></tr>'; }).join('') + '</table></div>') + '</div>';
  h += '<div class="card"><h2>ผลพิจารณา</h2>' + (cs.sug ? '<p>ผลตามการตรวจ: ' + badge({ k: cs.sug === 'อนุมัติ' ? 'ok' : cs.sug === 'ไม่อนุมัติ' ? 'bad' : 'warn', t: 'แนะนำ: ' + cs.sug }) +
    (cs.c.none ? ' <span class="muted">(ยังไม่ตรวจ ' + cs.c.none + ' ข้อ)</span>' : '') + '</p>' : '') +
    '<div class="grid3"><div><label class="f" for="dSt">ผลพิจารณา</label><select id="dSt" class="i">' + opts(SUB_ST, s.status) + '</select></div>' + inp('dAp', 'วันที่อนุมัติ', s.approved_date, 'date') + '</div>' +
    '<label class="f" for="dRm">หมายเหตุ / เอกสารที่ต้องขอเพิ่ม</label><textarea id="dRm" class="i" rows="2">' + esc(s.remark) + '</textarea>' +
    '<div class="row" style="margin-top:10px"><button class="btn" data-act="subDecide" data-sid="' + sid + '">บันทึกผลพิจารณา</button>' + (cs.sug && cs.sug !== s.status ? '<button class="btn sec" data-act="subSuggest" data-sug="' + cs.sug + '">ใช้ผลตามการตรวจ</button>' : '') + '</div></div>';
  return h;
}
function docMat(sid) {
  var s = S.submittals.filter(function (x) { return x.id === sid; })[0]; if (!s) return '<div class="card empty">ไม่พบรายการ</div>';
  var p = S.P, t = taskById(s.taskId), cr = criteriaOf(s), ch = s.checks || {}, cs = checkSummary(s), fl = filesOf('submittal', sid);
  var imgs = fl.filter(function (f) { return f.mime !== 'application/pdf'; }).slice(0, 6), rows = cr.filter(function (x) { return !ch[x.key] || ch[x.key].v !== 'ไม่เกี่ยวข้อง'; });
  return '<div class="doc"><h1>รายงานผลการตรวจสอบและขออนุมัติใช้วัสดุ</h1><p style="text-align:center;margin-top:-4px">' + esc(p.org || '') + '</p>' + docHead() +
    '<table><tr><td style="width:24%">เลขที่เอกสาร</td><td>' + esc(s.doc_no) + '</td><td style="width:18%">วันที่ยื่น</td><td>' + th(s.submitted_date) + '</td></tr>' +
    '<tr><td>วัสดุ</td><td>' + esc(s.material) + '</td><td>ยี่ห้อ / รุ่น</td><td>' + esc(s.brand || '-') + '</td></tr>' +
    '<tr><td>เกณฑ์ที่ใช้ตรวจ</td><td colspan="3">' + esc(s.spec_sec ? specName(s.spec_sec) + ' (' + ((window.SPEC && SPEC.source) || '') + ')' : 'ข้อกำหนดเฉพาะรายการ') + '</td></tr>' +
    '<tr><td>ใช้กับงาน</td><td colspan="3">' + (t ? esc(wbsOf(t.id) + ' ' + t.desc) : '-') + '</td></tr>' +
    '<tr><td>เอกสารแนบ</td><td colspan="3">' + (fl.length ? fl.map(function (f, i) { return (i + 1) + '. ' + esc(f.name) + (f.caption ? ' – ' + esc(f.caption) : ''); }).join('<br>') : '-') + '</td></tr></table>' +
    '<h3>ผลการตรวจเทียบข้อกำหนด (ผ่าน ' + cs.c['ผ่าน'] + ' • ไม่ผ่าน ' + cs.c['ไม่ผ่าน'] + ' • ไม่พบข้อมูล ' + cs.c['ไม่พบข้อมูล'] + (cs.c.none ? ' • ยังไม่ตรวจ ' + cs.c.none : '') + ')</h3>' +
    (rows.length ? '<table><tr><th style="width:8%">ข้อ</th><th>ข้อกำหนด</th><th style="width:28%">สิ่งที่พบ</th><th style="width:13%">ผล</th></tr>' + rows.map(function (x) { var c = ch[x.key] || {};
      return '<tr><td>' + esc(x.cl) + '</td><td>' + esc(x.req) + '</td><td>' + esc(c.note || '') + '</td><td class="v-' + esc(c.v || '') + '">' + esc(c.v || '-') + '</td></tr>'; }).join('') + '</table>' : '<p>-</p>') +
    '<h3>ผลการพิจารณาของผู้ควบคุมงาน</h3><p><b>' + esc(s.status) + '</b>' + (s.approved_date ? ' เมื่อ ' + th(s.approved_date) : '') + (s.remark ? '<br>หมายเหตุ: ' + esc(s.remark) : '') + '</p>' +
    (imgs.length ? '<h3>ภาพประกอบ</h3>' + photoGrid(imgs, 'ภาพที่') : '') +
    '<div class="sig"><div>ลงชื่อ ...........................<br>(...........................)<br>ผู้เสนอขออนุมัติ (ผู้รับจ้าง)</div><div>ลงชื่อ ...........................<br>(' + esc(p.supervisor_name || '...........................') + ')<br>' + esc(p.supervisor_pos || 'ผู้ควบคุมงาน') + '</div>' +
    '<div>ลงชื่อ ...........................<br>(' + esc(p.chair || '...........................') + ')<br>ประธานกรรมการตรวจรับพัสดุ</div></div></div>';
}

/* ---------------- APP SETTINGS ---------------- */
async function vApp() {
  var lastBk = await meta('lastBackup'), est = null, persisted = null;
  try { if (navigator.storage && navigator.storage.estimate) est = await navigator.storage.estimate(); if (navigator.storage && navigator.storage.persisted) persisted = await navigator.storage.persisted(); } catch (e) {}
  var theme = document.documentElement.dataset.theme || 'auto';
  var standalone = window.matchMedia && matchMedia('(display-mode: standalone)').matches;
  var ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  var ai = await aiCfg(), used = num((ai.used || {})[iso(today())]);
  var gem = ai.provider !== 'claude', mask = function (k) { return k ? '••••••••' + k.slice(-6) : ''; };
  var aiHtml = '<div class="card"><h2>AI ตรวจสเปกวัสดุ</h2>' +
    (aiSandboxed() ? '<div class="banner warn">' + ic('alert') + '<span class="grow">หน้าทดลองนี้ไม่อนุญาตให้เชื่อมต่อภายนอก – AI ใช้ได้เมื่อเปิดแอปจาก GitHub Pages</span></div>' : '') +
    '<label class="f">ผู้ให้บริการ AI</label><div class="seg" id="aiProv"><button data-prov="gemini" class="' + (gem ? 'on' : '') + '">Google Gemini (ฟรี)</button><button data-prov="claude" class="' + (gem ? '' : 'on') + '">Claude (เสียค่าใช้จ่าย)</button></div>' +
    '<div id="aiGem" class="' + (gem ? '' : 'hidden') + '"><p class="muted" style="margin-top:10px"><b>วิธีรับคีย์ฟรี:</b> เข้า <b>aistudio.google.com</b> ด้วยบัญชี Google → <b>Get API key</b> → <b>Create API key</b> → คัดลอกคีย์ (ขึ้นต้น AIza…) มาวางด้านล่าง • ไม่ต้องใช้บัตรเครดิต</p>' +
    '<div class="banner warn">' + ic('alert') + '<span class="grow">แบบฟรี: Google อาจนำข้อมูลที่ส่งตรวจไปใช้ปรับปรุงบริการ และจำกัดจำนวนครั้งต่อนาที/ต่อวัน – อย่าส่งเอกสารลับของทางราชการ</span></div>' +
    '<div class="grid2">' + inp('aiGKey', 'Gemini API key (AIza…)', mask(ai.gkey), 'password', 'autocomplete="off"') + inp('aiGModel', 'โมเดล (เว้นว่าง = เลือกอัตโนมัติ)', ai.gmodel) + '</div></div>' +
    '<div id="aiCla" class="' + (gem ? 'hidden' : '') + '"><p class="muted" style="margin-top:10px">console.anthropic.com → เติมเครดิต → API Keys • มีค่าใช้จ่ายตามการใช้งาน</p>' +
    '<div class="grid2">' + inp('aiKey', 'Claude API key (sk-ant-…)', mask(ai.key), 'password', 'autocomplete="off"') + inp('aiModel', 'โมเดล', ai.model || AI_DEFAULT_MODEL) + '</div></div>' +
    '<div class="grid2">' + inp('aiLimit', 'จำกัดจำนวนครั้งต่อวัน (ครั้งที่ผิดพลาดนับด้วย)', ai.limit, 'number', 'min="1"') + '</div>' +
    '<p class="muted">ใช้วันนี้ ' + used + ' / ' + ai.limit + ' ครั้ง • สถานะ: ' + (aiReady(ai) ? '<span class="ok-t">พร้อมใช้ – ' + esc(aiName(ai)) + '</span>' : 'ยังไม่ได้ตั้งค่า') + ' • คีย์เก็บเฉพาะในเครื่องนี้ ไม่อยู่ในไฟล์สำรองหรือการซิงก์</p>' +
    '<div class="row"><button class="btn" data-act="aiSave">บันทึก</button><button class="btn sec" data-act="aiTest" ' + (aiReady(ai) ? '' : 'disabled') + '>ทดสอบการเชื่อมต่อ</button>' + (ai.key || ai.gkey ? '<button class="btn ghost bad-t" data-act="aiClear">ลบ API key</button>' : '') + '</div></div>';
  return pageHead('ตั้งค่าและสำรองข้อมูล', 'การแสดงผล การสำรอง/กู้คืน AI และการติดตั้งแอป', '') + '<div class="card"><h2>การแสดงผล</h2><div class="seg" id="themeSeg">' + [['auto', 'ตามเครื่อง'], ['light', 'สว่าง'], ['dark', 'มืด']].map(function (x) {
      return '<button data-theme="' + x[0] + '" class="' + (theme === x[0] ? 'on' : '') + '">' + x[1] + '</button>'; }).join('') + '</div></div>' +
    '<div class="card"><h2>สำรองและกู้คืนข้อมูล</h2><p>ข้อมูลทั้งหมดเก็บในเครื่องนี้เท่านั้น (ไม่ได้ส่งขึ้นอินเทอร์เน็ต) ถ้าล้างข้อมูลเบราว์เซอร์ เปลี่ยนเครื่อง หรือเครื่องเสีย ข้อมูลจะหาย – <b>ควรสำรองสัปดาห์ละครั้ง</b> แล้วเก็บไฟล์ไว้ใน Google Drive/OneDrive</p>' +
    '<p class="muted">สำรองครั้งล่าสุด: ' + (lastBk ? th(lastBk.slice(0, 10)) + ' ' + lastBk.slice(11, 16) + ' น.' : '<span class="bad-t">ยังไม่เคยสำรอง</span>') + '</p>' +
    '<div class="row"><button class="btn acc" data-act="backup">สำรองข้อมูลทั้งหมด (รวมรูป)</button><button class="btn sec" data-act="backupLite">สำรองแบบไม่รวมรูป</button>' +
    '<label class="btn sec" style="display:inline-block">กู้คืนจากไฟล์<input type="file" class="hidden" id="restoreFile" accept=".json,application/json"></label></div>' +
    '<p class="muted">ย้ายไปเครื่องใหม่: สำรองในเครื่องเดิม → เปิดแอปในเครื่องใหม่ → กู้คืนจากไฟล์</p></div>' +
    (await syncCard()) + aiHtml + '<div class="card"><h2>พื้นที่จัดเก็บ</h2><p>' + (est ? 'ใช้ไป ' + (est.usage / 1048576).toFixed(1) + ' MB จากที่ใช้ได้ประมาณ ' + (est.quota / 1073741824).toFixed(1) + ' GB' : 'ไม่ทราบขนาด') + '</p>' +
    '<p class="muted">การป้องกันการลบอัตโนมัติ: ' + (persisted ? '<span class="ok-t">✓ เปิดแล้ว</span>' : 'ยังไม่เปิด <button class="btn sm sec" data-act="persist">ขอเปิด</button>') + ' – ช่วยไม่ให้เบราว์เซอร์ลบข้อมูลเองเมื่อพื้นที่เครื่องเหลือน้อย</p></div>' +
    '<div class="card"><h2>ติดตั้งเป็นแอป</h2>' + (standalone ? '<p class="ok-t">✓ กำลังใช้งานแบบแอปที่ติดตั้งแล้ว</p>' :
      '<button class="btn" data-act="install">' + ic('download') + 'ติดตั้งลงเครื่องนี้</button>' +
      '<p class="muted">' + (ios ? 'iPhone/iPad: เปิดใน Safari → ปุ่มแชร์ → "เพิ่มไปยังหน้าจอโฮม"' : 'คอมพิวเตอร์ (Chrome/Edge): กดไอคอน ⊕ ท้ายช่องที่อยู่เว็บ หรือเมนู ⋮ → "ติดตั้งแอป" • Android (Chrome): เมนู ⋮ → "ติดตั้งแอป" / "เพิ่มลงในหน้าจอหลัก"') + '</p>') +
    '<p class="muted">ติดตั้งแล้วเปิดจากไอคอนได้เหมือนโปรแกรม และใช้งานได้แม้ไม่มีอินเทอร์เน็ต</p></div>' +
    '<div class="card"><h2>เกี่ยวกับ</h2><p>คุมงานก่อสร้าง เวอร์ชัน ' + APP_VERSION + ' • ข้อมูลรายการประกอบแบบ: ' + esc((window.SPEC && SPEC.source) || '-') + ' (' + ((window.SPEC && SPEC.items.length) || 0) + ' ข้อ)</p>' +
    '<button class="btn sec" data-act="samples">สร้างโครงการตัวอย่าง (3 แบบ)</button> <button class="btn sm ghost bad-t" data-act="wipe">ล้างข้อมูลทั้งหมด</button></div>';
}
function b64FromBlob(b) { return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(String(r.result).split(',')[1] || ''); }; r.onerror = function () { rej(r.error); }; r.readAsDataURL(b); }); }
function blobFromB64(b64, mime) { var bin = atob(b64), a = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new Blob([a], { type: mime }); }
async function saveBlob(name, blob) {
  if (window.claude && typeof window.claude.use === 'function') {
    var dl = null; try { dl = await window.claude.use('downloads'); } catch (e) {}
    if (dl) { try { await dl.save({ filename: name, data: await blob.arrayBuffer() }); return true; } catch (e) { if (e && e.code === 'declined') return false; throw new Error('ดาวน์โหลดไม่สำเร็จ'); } }
  }
  var u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(u); }, 30000); return true;
}
async function doBackup(withFiles) {
  toast('กำลังเตรียมไฟล์สำรอง…', false, 8000);
  var out = { app: 'sitecontrol', version: APP_VERSION, exported: new Date().toISOString(), withFiles: withFiles, stores: {} };
  for (var i = 0; i < STORES.length; i++) {
    var s = STORES[i]; if (s === 'meta') continue;
    var rows = await DB.all(s);
    if (s === 'files') {
      var arr = [];
      for (var j = 0; j < rows.length; j++) { var f = Object.assign({}, rows[j]); var b = f.blob; delete f.blob; if (withFiles && !b && f.driveId) { try { b = (await ensureBlob(rows[j])); } catch (e) {} } if (withFiles && b) f.data = await b64FromBlob(b); arr.push(f); }
      rows = arr;
    }
    out.stores[s] = rows;
  }
  var stamp = new Date(), name = 'สำรอง_คุมงาน_' + iso(stamp) + (withFiles ? '' : '_ไม่รวมรูป') + '.json';
  if (await saveBlob(name, new Blob([JSON.stringify(out)], { type: 'application/json' }))) {
    await meta('lastBackup', stamp.toISOString()); toast('สำรองข้อมูลแล้ว: ' + name, false, 4500);
  }
}
async function doRestore(file) {
  var data; try { data = JSON.parse(await file.text()); } catch (e) { throw new Error('ไฟล์นี้ไม่ใช่ไฟล์สำรองของแอป'); }
  if (!data || data.app !== 'sitecontrol' || !data.stores) throw new Error('ไฟล์นี้ไม่ใช่ไฟล์สำรองของแอป');
  var np = (data.stores.projects || []).length;
  var bg = modal('<h2>กู้คืนข้อมูล</h2><p>ไฟล์สำรองวันที่ <b>' + th((data.exported || '').slice(0, 10)) + '</b> มี ' + np + ' โครงการ' + (data.withFiles ? ' (รวมรูป)' : ' (ไม่รวมรูป)') + '</p>' +
    '<label class="row"><input type="radio" name="rm" value="merge" checked><span><b>รวมกับข้อมูลเดิม</b> – รายการที่ซ้ำจะใช้ข้อมูลจากไฟล์</span></label>' +
    '<label class="row" style="margin-top:6px"><input type="radio" name="rm" value="replace"><span><b>แทนที่ทั้งหมด</b> – ลบข้อมูลในเครื่องแล้วใช้ข้อมูลจากไฟล์</span></label>', async function (bg) {
      var mode = bg.querySelector('input[name=rm]:checked').value;
      if (mode === 'replace') for (var i = 0; i < STORES.length; i++) if (STORES[i] !== 'meta') await DB.clear(STORES[i]);
      for (var s in data.stores) {
        if (STORES.indexOf(s) < 0 || s === 'meta') continue;
        var rows = data.stores[s];
        if (s === 'files') rows = rows.filter(function (f) { return f.data; }).map(function (f) { var o = Object.assign({}, f); o.blob = blobFromB64(f.data, f.mime); delete o.data; return o; });
        await DB.putMany(s, rows);
      }
      S.P = null; toast('กู้คืนข้อมูลแล้ว (' + np + ' โครงการ)'); go('/');
    }, 'กู้คืน');
}
function exportXlsx() {
  return loadXlsx().then(async function () {
    var p = S.P, d = today(), w = weightFn(), wb = XLSX.utils.book_new(), dt = function (x) { return x ? D(x) : null; }, hist = histIndex();
    var add = function (name, rows, widths) { var sh = XLSX.utils.aoa_to_sheet(rows, { cellDates: true }); sh['!cols'] = widths.map(function (x) { return { wch: x }; }); XLSX.utils.book_append_sheet(wb, sh, name); return sh; };
    var pl = planAt(d), ac = actualNow();
    var s1 = add('สรุป', [['โครงการ', p.name], ['ผู้ว่าจ้าง', p.employer], ['ผู้รับจ้าง', p.contractor], ['เลขที่สัญญา', p.contract_no], ['ข้อมูล ณ วันที่', d], ['มูลค่าสัญญาเดิม', num(p.bac)],
      ['วันเริ่มสัญญา', projStart()], ['ระยะเวลาสัญญา (วัน)', projDur()], ['วันสิ้นสุด (รวมขยายเวลา)', projEnd()], ['ผลงานตามแผน', pl], ['ผลงานจริง', ac], ['ผลต่าง', ac - pl], ['SPI', pl ? ac / pl : '']], [24, 50]);
    ['B10', 'B11', 'B12'].forEach(function (a) { if (s1[a]) s1[a].z = '0.00%'; });
    var s2 = add('แผนงาน', [['WBS', 'งานส่วน', 'หมวดงาน', 'รายการงาน', 'มูลค่า BOQ', 'น้ำหนัก', 'เริ่มแผน', 'เสร็จแผน', 'เริ่มเร่งรัด', 'เสร็จเร่งรัด', 'เริ่มจริง', 'เสร็จจริง', '% จริง', '% ควรได้', 'สถานะ', 'หมายเหตุ']].concat(
      wbsList().map(function (o) { var t = o.t; return [o.wbs, t.part, t.cat, t.desc, num(t.boq), w(t), dt(t.bs), dt(t.bf), dt(t.rs), dt(t.rf), dt(t.as), dt(t.af), num(t.pct) / 100, spanPct(D(t.bs), D(t.bf), d), taskStatus(t).t, t.remark || '']; })),
      [8, 20, 16, 40, 14, 9, 11, 11, 11, 11, 11, 11, 9, 9, 14, 30]);
    var rg = XLSX.utils.decode_range(s2['!ref']); for (var R = 1; R <= rg.e.r; R++) [5, 12, 13].forEach(function (C) { var c = s2[XLSX.utils.encode_cell({ r: R, c: C })]; if (c && c.t === 'n') c.z = '0.00%'; });
    var curve = [['สัปดาห์', 'สิ้นสัปดาห์', 'แผนสะสม', 'จริงสะสม']];
    for (var n = 1; n <= totalWeeks(); n++) { var r = weekRange(n); curve.push([n, r.end, planAt(r.end), r.end <= d ? actualAt(r.end, hist) : '']); }
    var s3 = add('S-Curve', curve, [9, 12, 10, 10]); var r3 = XLSX.utils.decode_range(s3['!ref']); for (var R3 = 1; R3 <= r3.e.r; R3++) [2, 3].forEach(function (C) { var c = s3[XLSX.utils.encode_cell({ r: R3, c: C })]; if (c && c.t === 'n') c.z = '0.00%'; });
    add('ประวัติผลงาน', [['วันที่', 'WBS', 'รายการงาน', '% ผลงาน', 'ที่มา']].concat(S.progress.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; }).map(function (x) { var t = taskById(x.taskId);
      return [dt(x.date), t ? wbsOf(t.id) : '', t ? t.desc : '(ลบแล้ว)', num(x.pct), x.source === 'daily' ? 'รายงานประจำวัน' : x.source === 'import' ? 'นำเข้า' : 'อัปเดต']; })), [11, 8, 40, 9, 16]);
    add('รายงานประจำวัน', [['วันที่', 'อากาศเช้า', 'อากาศบ่าย', 'การทำงาน', 'คนงาน (คน)', 'รายละเอียดคนงาน', 'เครื่องจักร', 'งานที่ทำ', 'วัสดุเข้า', 'การทดสอบ', 'ปัญหา', 'คำสั่งผู้ควบคุมงาน', 'รูป']].concat(
      S.daily.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; }).map(function (x) { return [dt(x.date), x.weatherAM, x.weatherPM, x.status, manTotal(x),
        (x.manpower || []).map(function (m) { return m.trade + ' ' + m.count; }).join(', '), (x.machinery || []).map(function (m) { return m.name + ' ' + m.count; }).join(', '), x.work || '', x.materials || '', x.tests || '', x.issues || '', x.instructions || '', filesOf('daily', x.date).length]; })),
      [11, 12, 12, 16, 9, 30, 26, 40, 24, 24, 30, 30, 6]);
    add('ขออนุมัติวัสดุ', [['เลขที่', 'วัสดุ', 'ยี่ห้อ', 'หมวดเกณฑ์', 'ใช้กับงาน', 'วันที่ยื่น', 'ต้องอนุมัติภายใน', 'ผลพิจารณา', 'วันที่อนุมัติ', 'ตรวจแล้ว (ข้อ)', 'สถานะ']].concat(
      S.submittals.map(function (s) { var r = subRisk(s), cs = checkSummary(s); return [s.doc_no, s.material, s.brand, s.spec_sec ? specName(s.spec_sec) : 'กำหนดเอง', wbsOf(s.taskId), dt(s.submitted_date), r.need || '', s.status, dt(s.approved_date), cs.done + '/' + cs.n, r.t]; })),
      [10, 26, 16, 30, 10, 11, 12, 16, 11, 10, 26]);
    var ab = XLSX.write(wb, { bookType: 'xlsx', type: 'array', cellDates: true });
    await loadJSZip(); var zz = await JSZip.loadAsync(ab); await applyThaiFont(zz, 16 / 12, 0);
    var blob = await zz.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', compression: 'DEFLATE' });
    if (await saveBlob(p.name.replace(/[\\\/:*?"<>|]/g, '_').slice(0, 60) + '_' + iso(d) + '.xlsx', blob)) toast('ส่งออก Excel แล้ว');
  });
}


/* ---------------- ติดตั้งแอป ---------------- */
function isStandalone() { return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true; }
function installEnv() {
  var ua = navigator.userAgent, host = location.host;
  if (location.protocol === 'file:' || /claudeusercontent|claude\.ai|claude\.site/.test(host)) return 'preview';
  if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return /crios|fxios|edgios/i.test(ua) ? 'ios-other' : 'ios';
  if (/android/i.test(ua)) return 'android';
  if (/firefox/i.test(ua)) return 'firefox';
  if (/safari/i.test(ua) && !/chrome|chromium|edg/i.test(ua)) return 'mac-safari';
  return 'desktop';
}
function installCard() {
  if (isStandalone()) return '';
  return '<div class="card"><div class="card-h"><h2>ติดตั้งเป็นแอปบนเครื่องนี้</h2><button class="btn" data-act="install">' + ic('download') + 'ติดตั้งแอป</button></div>' +
    '<p class="muted">ติดตั้งแล้วเปิดจากไอคอนบนหน้าจอ/เดสก์ท็อปได้เหมือนโปรแกรม หน้าต่างแยก ใช้งานได้แม้ไม่มีอินเทอร์เน็ต</p></div>';
}
async function doInstall() {
  if (S.deferredInstall) {
    S.deferredInstall.prompt(); var c = await S.deferredInstall.userChoice; S.deferredInstall = null;
    if (c && c.outcome === 'accepted') toast('กำลังติดตั้งแอป…'); return;
  }
  var env = installEnv(), url = location.origin + location.pathname;
  var step = function (arr) { return '<ol style="padding-left:20px;margin:6px 0">' + arr.map(function (x) { return '<li style="margin:4px 0">' + x + '</li>'; }).join('') + '</ol>'; };
  var body = {
    preview: '<div class="banner warn">' + ic('alert') + '<span class="grow">หน้านี้เป็น<b>หน้าทดลองบน claude.ai</b> ซึ่งติดตั้งเป็นแอปไม่ได้</span></div>' +
      '<p>ต้องนำแอปขึ้น <b>GitHub Pages</b> ก่อน (ครั้งเดียว ~10 นาที) แล้วเปิดจากลิงก์นั้นจึงจะติดตั้งได้:</p>' +
      step(['แตกไฟล์ <b>site-control-v2.zip</b>', 'github.com → New repository (Public) เช่น <b>site-control</b>', 'Add file → Upload files → ลากไฟล์ทั้งหมดในโฟลเดอร์ site-control → Commit',
        'Settings → Pages → Branch: main / (root) → Save', 'เปิด <b>https://patarakorn-bas.github.io/site-control/</b> แล้วกดปุ่ม <b>ติดตั้งแอป</b> อีกครั้ง']) +
      '<p class="muted">ข้อมูลในหน้าทดลองนี้แยกจากแอปที่ติดตั้ง – ถ้าต้องการย้าย ให้สำรองข้อมูลที่นี่แล้วกู้คืนในแอปที่ติดตั้ง</p>',
    ios: step(['เปิดลิงก์นี้ใน <b>Safari</b>', 'แตะปุ่ม <b>แชร์</b> (สี่เหลี่ยมมีลูกศรขึ้น)', 'เลื่อนหา <b>เพิ่มไปยังหน้าจอโฮม</b> (Add to Home Screen)', 'แตะ <b>เพิ่ม</b> – ไอคอนแอปจะอยู่บนหน้าจอโฮม']),
    'ios-other': '<p>บน iPhone/iPad ให้เปิดลิงก์นี้ใน <b>Safari</b>:</p>' + step(['คัดลอกลิงก์: <b>' + esc(url) + '</b>', 'เปิดใน Safari → แตะ <b>แชร์</b> → <b>เพิ่มไปยังหน้าจอโฮม</b>']),
    android: step(['เปิดลิงก์นี้ใน <b>Chrome</b>', 'แตะเมนู <b>⋮</b> มุมขวาบน', 'เลือก <b>ติดตั้งแอป</b> หรือ <b>เพิ่มลงในหน้าจอหลัก</b>', 'แตะ <b>ติดตั้ง</b>']),
    firefox: '<p>Firefox บนคอมพิวเตอร์ยังไม่รองรับการติดตั้งแอปเว็บ ให้เปิดลิงก์นี้ด้วย <b>Google Chrome</b> หรือ <b>Microsoft Edge</b> แล้วกดติดตั้งอีกครั้ง</p><p><b>' + esc(url) + '</b></p>',
    'mac-safari': step(['เมนู <b>File (ไฟล์)</b> → <b>Add to Dock (เพิ่มไปยัง Dock)</b>', 'หรือเปิดด้วย Chrome/Edge แล้วกดติดตั้ง']),
    desktop: step(['มองหาไอคอน <b>ติดตั้ง</b> (จอคอมมีลูกศรลง) ท้ายช่องที่อยู่เว็บ แล้วกด <b>ติดตั้ง</b>', 'ถ้าไม่เห็น: เมนู <b>⋮</b> (Chrome) หรือ <b>…</b> (Edge) → <b>บันทึกและแชร์ / แอป</b> → <b>ติดตั้งหน้านี้เป็นแอป</b>',
      'ถ้ายังไม่มีตัวเลือก ให้รีเฟรชหน้า 1 ครั้งแล้วรอสักครู่ (เบราว์เซอร์ต้องโหลดไฟล์ให้ครบก่อน)'])
  }[env];
  modal('<h2>ติดตั้งแอปบนเครื่องนี้</h2>' + body);
}
/* ---------------- EVENTS ---------------- */
document.addEventListener('click', async function (e) {
  var pv = e.target.closest('[data-prov]');
  if (pv) { $$('#aiProv button').forEach(function (b) { b.classList.toggle('on', b === pv); }); $('#aiGem').classList.toggle('hidden', pv.dataset.prov !== 'gemini'); $('#aiCla').classList.toggle('hidden', pv.dataset.prov !== 'claude'); return; }
  var el = e.target.closest('[data-go],[data-act],[data-prog],[data-task],[data-tf],[data-tp],[data-open],[data-fdel],[data-sub],[data-addrow],[data-ldel],[data-fill],[data-wph],[data-chkall],[data-theme],[data-inst],[data-vo],[data-eot]');
  if (!el) return;
  try {
    if (el.dataset.open) return openFile(el.dataset.open);
    if (el.dataset.wph) { var ph = S.weekDraft.photos, i = ph.indexOf(el.dataset.wph); if (i >= 0) ph.splice(i, 1); else ph.push(el.dataset.wph); await saveWeekly(); return render(); }
    if (el.dataset.go != null) return go(el.dataset.go);
    if (el.dataset.prog) return openProgress(el.dataset.prog);
    if (el.dataset.task != null) return openTask(el.dataset.task || null);
    if (el.dataset.tf != null) { TF.st = el.dataset.tf; return render(); }
    if (el.dataset.tp != null) { TF.part = el.dataset.tp; return render(); }
    if (el.dataset.sub) return openSub(el.dataset.sub === 'new' ? null : el.dataset.sub);
    if (el.dataset.inst != null) return openInst(el.dataset.inst || null);
    if (el.dataset.vo != null) return openVO(el.dataset.vo || null);
    if (el.dataset.eot != null) return openEOT(el.dataset.eot || null);
    if (el.dataset.theme) { var t = el.dataset.theme; if (t === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t; try { localStorage.setItem('sc_theme', t); } catch (x) {} return render(); }
    if (el.dataset.fdel) {
      if (!(await confirmBox('ลบไฟล์นี้?', 'ลบ'))) return;
      await DB.del('files', el.dataset.fdel); S.files = S.files.filter(function (f) { return f.id !== el.dataset.fdel; });
      if (S.weekDraft && S.weekDraft.photos) { S.weekDraft.photos = S.weekDraft.photos.filter(function (x) { return x !== el.dataset.fdel; }); }
      toast('ลบแล้ว'); return render();
    }
    if (el.dataset.addrow) { var L = S.dailyDraft[el.dataset.addrow]; L.push(el.dataset.addrow === 'manpower' ? { trade: el.dataset.name, count: '' } : { name: el.dataset.name, count: 1 }); await saveDaily(); render(); setTimeout(function () { var ins = $$('[data-l="' + el.dataset.addrow + '"][data-f=c]'); if (ins.length) ins[ins.length - 1].focus(); }, 50); return; }
    if (el.dataset.ldel) { S.dailyDraft[el.dataset.ldel].splice(+el.dataset.i, 1); await saveDaily(); return render(); }
    if (el.dataset.fill) { var st = weekStats(S.weekDraft.week), k = el.dataset.fill, src = { work_done: 'work', issues: 'issues', materials: 'materials' }[k];
      var txt = compileText(st, src) + (k === 'materials' && compileText(st, 'tests') ? '\n' + compileText(st, 'tests') : ''); $('#w_' + k).value = S.weekDraft[k] = txt; await saveWeekly(); return; }
    if (el.dataset.chkall) { var s = S.submittals.filter(function (x) { return x.id === S.route[3]; })[0]; s.checks = s.checks || {};
      criteriaOf(s).forEach(function (x) { if (!s.checks[x.key] || !s.checks[x.key].v) s.checks[x.key] = { v: el.dataset.chkall, note: (s.checks[x.key] || {}).note || '' }; }); await DB.put('submittals', s); return render(); }
    var a = el.dataset.act;
    if (a === 'newProject') newProject();
    else if (a === 'importXlsx') importXlsx();
    else if (a === 'sample') { var id = await createSample(el.dataset.kind || 'behind'); go('/p/' + id); }
    else if (a === 'samples') {
      var bgS = modal('<h2>สร้างโครงการตัวอย่าง</h2><p class="muted">โครงการ 6 งานส่วนเหมือนกัน แต่ผลการดำเนินงานต่างกัน ใช้ดูว่าหน้าจอ รายงาน และไฟล์ Excel แสดงผลอย่างไรในแต่ละสถานการณ์</p>' +
        '<div style="display:grid;gap:8px">' + [['ahead', 'เร็วกว่าแผน (+)', 'ผลงานจริงนำหน้าแผน ส่งมอบงวดตรงเวลา ไม่มีค่าปรับ'], ['ontrack', 'ตามแผน (ปกติ)', 'ผลงานจริงใกล้เคียงแผน'], ['behind', 'ล่าช้ากว่าแผน (−)', 'ผลงานจริงตามหลังแผน มีงวดเกินกำหนด ขอขยายเวลา และค่าปรับคาดการณ์'], ['all', 'สร้างทั้ง 3 แบบ', 'เพื่อเปรียบเทียบในหน้าโครงการทั้งหมด']].map(function (x) {
          return '<button class="btn sec" style="justify-content:flex-start;text-align:left;white-space:normal" data-mk="' + x[0] + '"><span><b>' + x[1] + '</b><br><span class="muted">' + x[2] + '</span></span></button>'; }).join('') + '</div>');
      $$('[data-mk]', bgS).forEach(function (bt) { bt.onclick = async function () {
        bgS.remove(); var k = bt.dataset.mk;
        if (k === 'all') { for (var q = 0; q < 3; q++) await createSample(['behind', 'ontrack', 'ahead'][q]); toast('สร้างโครงการตัวอย่าง 3 แบบแล้ว'); if (location.hash === '#/' || !location.hash) render(); else go('/'); }
        else go('/p/' + (await createSample(k)));
      }; });
    }
    else if (a === 'backup') await doBackup(true);
    else if (a === 'backupLite') await doBackup(false);
    else if (a === 'persist') { var ok = navigator.storage && navigator.storage.persist ? await navigator.storage.persist() : false; toast(ok ? 'เปิดการป้องกันแล้ว' : 'เบราว์เซอร์ไม่อนุญาต – ติดตั้งเป็นแอปจะช่วยได้', !ok); render(); }
    else if (a === 'install') { await doInstall(); }
    else if (a === 'wipe') { if (await confirmBox('ลบข้อมูลทุกโครงการในเครื่องนี้? (ถ้าเปิดซิงก์ไว้ ข้อมูลบนคลาวด์ยังอยู่และจะถูกดึงกลับเมื่อซิงก์ครั้งถัดไป)', 'ลบทั้งหมด')) { for (var q = 0; q < STORES.length; q++) if (STORES[q] !== 'meta') await DB.clear(STORES[q]); await syncResetLocal(); S.P = null; toast('ล้างข้อมูลในเครื่องแล้ว'); go('/'); } }
    else if (a === 'pasteTasks') pasteTasks();
    else if (a === 'saveProj') { var box = $('#projFormBox'); readProjectForm(box, S.P); await saveProject(); toast('บันทึกแล้ว'); render(); }
    else if (a === 'archive') { S.P.archived = !S.P.archived; await saveProject(); toast(S.P.archived ? 'เก็บเข้าคลังแล้ว' : 'นำออกจากคลังแล้ว'); render(); }
    else if (a === 'delProject') {
      var name = S.P.name;
      var bg = modal('<h2>ลบโครงการ</h2><p>พิมพ์ชื่อโครงการ <b>' + esc(name) + '</b> เพื่อยืนยัน</p><input class="i" id="cn">', async function (bg) {
        if (val(bg, 'cn') !== name) throw new Error('ชื่อไม่ตรง'); var pid = S.P.id;
        for (var i = 0; i < STORES.length; i++) { var s = STORES[i]; if (s === 'projects' || s === 'meta') continue; var rows = await DB.byProject(s, pid); await DB.delMany(s, rows.map(function (r) { return r.id; })); }
        await DB.del('projects', pid); S.P = null; toast('ลบโครงการแล้ว'); go('/');
      }, 'ลบถาวร');
    }
    else if (a === 'exportXlsx') await exportXlsx();
    else if (a === 'exportV4') { el.disabled = true; var old = el.innerHTML; el.innerHTML = '<span class="spin"></span> กำลังสร้างไฟล์…'; try { await exportV4(); } finally { el.disabled = false; el.innerHTML = old; } }
    else if (a === 'finSet') openFinSet();
    else if (a === 'syncNow') { await syncNow(true); render(); }
    else if (a === 'syncOn') {
      el.disabled = true; el.innerHTML = '<span class="spin"></span> กำลังเชื่อมต่อ…';
      try { var inf = await syncConnect($('#syUrl').value, $('#syKey').value); toast('เชื่อมต่อแล้ว (บนคลาวด์มี ' + inf.records + ' รายการ) – กำลังซิงก์…', false, 4000); await syncNow(false); toast(SYNC.state === 'ok' ? 'ซิงก์ครั้งแรกเสร็จแล้ว' : SYNC.msg, SYNC.state !== 'ok'); render(); }
      catch (er) { el.disabled = false; el.textContent = 'เชื่อมต่อและซิงก์'; throw er; }
    }
    else if (a === 'syncOff') { if (await confirmBox('ยกเลิกการซิงก์ในเครื่องนี้? ข้อมูลในเครื่องและบนคลาวด์ยังอยู่ครบ (รายการที่ยังไม่ได้ส่งจะไม่ถูกส่ง)', 'ยกเลิกการเชื่อมต่อ')) { await meta('sync', null); await syncResetLocal(); syncBadge(); render(); } }
    else if (a === 'printDash') go('/p/' + S.P.id + '/print/dash/0');
    else if (a === 'aiSave') {
      var cfg = await aiCfg(), prov = ($('#aiProv button.on') || {}).dataset ? $('#aiProv button.on').dataset.prov : 'gemini', gk = $('#aiGKey').value.trim(), ck = $('#aiKey').value.trim();
      cfg.provider = prov;
      if (gk && gk.indexOf('••') !== 0) { if (!/^AIza[\w-]{20,}$/.test(gk)) throw new Error('Gemini API key ต้องขึ้นต้นด้วย AIza'); cfg.gkey = gk; cfg.gmodel = ''; }
      if (ck && ck.indexOf('••') !== 0) { if (!/^sk-ant-/.test(ck)) throw new Error('Claude API key ต้องขึ้นต้นด้วย sk-ant-'); cfg.key = ck; }
      var gm = $('#aiGModel').value.trim(); if (gm !== (cfg.gmodel || '')) cfg.gmodel = gm;
      cfg.model = $('#aiModel').value.trim() || AI_DEFAULT_MODEL; cfg.limit = Math.max(1, Math.round(num($('#aiLimit').value) || 30));
      await meta('ai', cfg); toast('บันทึกการตั้งค่า AI แล้ว'); render();
    }
    else if (a === 'aiTest') { var c2 = await aiCfg(); if (aiSandboxed()) throw new Error('หน้าทดลองนี้ไม่อนุญาตให้เชื่อมต่อภายนอก'); el.disabled = true; try { toast(await aiTest(c2), false, 4500); render(); } finally { el.disabled = false; } }
    else if (a === 'aiClear') { if (await confirmBox('ลบ API key ทั้งหมดออกจากเครื่องนี้?', 'ลบ')) { var c3 = await aiCfg(); c3.key = ''; c3.gkey = ''; c3.gmodel = ''; await meta('ai', c3); render(); } }
    else if (a === 'aiRun') {
      var sa = S.submittals.filter(function (x) { return x.id === S.route[3]; })[0];
      var cfA = await aiCfg();
      if (!(await confirmBox('ส่งเอกสารแนบ ' + filesOf('submittal', sa.id).length + ' ไฟล์ให้ ' + aiName(cfA) + ' ตรวจเทียบข้อกำหนด? (ประมาณ 20–60 วินาที' + (cfA.provider === 'claude' ? ' มีค่าใช้จ่าย API' : ' ใช้โควตาฟรี') + ')', 'ตรวจด้วย AI'))) return;
      el.disabled = true; el.innerHTML = '<span class="spin"></span> AI กำลังตรวจ…';
      try { await aiCheck(sa); toast('AI ตรวจเสร็จแล้ว'); render(); } catch (er) { el.disabled = false; el.innerHTML = ic('spark') + 'ตรวจด้วย AI'; throw er; }
    }
    else if (a === 'aiApply') {
      var sp = S.submittals.filter(function (x) { return x.id === S.route[3]; })[0], n = 0; sp.checks = sp.checks || {};
      (sp.ai.items || []).forEach(function (x) { var c = sp.checks[x.key]; if (!c || !c.v) { sp.checks[x.key] = { v: x.verdict, note: (c && c.note) || ('AI: ' + x.found) }; n++; } });
      await DB.put('submittals', sp); toast('ใส่ผล AI ใน ' + n + ' ข้อที่ยังไม่ตรวจ – กรุณาตรวจทานก่อนพิจารณา'); render();
    }
    else if (a === 'openDay') { var dv = $('#dPick').value; if (D(dv)) go('/p/' + S.P.id + '/daily/' + dv); }
    else if (a === 'copyPrev') { var pr = dailyOf(el.dataset.date); S.dailyDraft.manpower = JSON.parse(JSON.stringify(pr.manpower || [])); S.dailyDraft.machinery = JSON.parse(JSON.stringify(pr.machinery || [])); await saveDaily(); toast('คัดลอกคนงานและเครื่องจักรแล้ว'); render(); }
    else if (a === 'delDaily') { var di = el.dataset.date; if (!(await confirmBox('ลบรายงานประจำวันที่ ' + th(di) + ' (รวมรูป และผลงานที่บันทึกจากรายงานนี้)?', 'ลบ'))) return;
      var fids = filesOf('daily', di).map(function (f) { return f.id; }), pids = S.progress.filter(function (x) { return x.date === di && x.source === 'daily'; });
      await DB.del('daily', S.P.id + '_' + di); await DB.delMany('files', fids); await DB.delMany('progress', pids.map(function (x) { return x.id; }));
      S.daily = S.daily.filter(function (x) { return x.date !== di; }); S.files = S.files.filter(function (f) { return fids.indexOf(f.id) < 0; }); S.progress = S.progress.filter(function (x) { return pids.indexOf(x) < 0; });
      for (var z = 0; z < pids.length; z++) { var tt = taskById(pids[z].taskId); if (tt) await syncTaskPct(tt); }
      toast('ลบแล้ว'); go('/p/' + S.P.id + '/daily'); }
    else if (a === 'printDaily') { if (S.dailyDraft) await saveDaily(); go('/p/' + S.P.id + '/print/daily/' + el.dataset.date); }
    else if (a === 'printWeekly') { await saveWeekly(); go('/p/' + S.P.id + '/print/weekly/' + el.dataset.week); }
    else if (a === 'print') { toast('กำลังเตรียมเอกสาร…'); await hydrateImgs(); await Promise.all($$('.doc img').map(function (im) { return im.complete && im.src ? 0 : new Promise(function (r) { im.onload = im.onerror = r; setTimeout(r, 8000); }); })); setTimeout(function () { window.print(); }, 200); }
    else if (a === 'subDecide' || a === 'subSuggest') {
      var sb = S.submittals.filter(function (x) { return x.id === S.route[3]; })[0];
      if (a === 'subSuggest') { $('#dSt').value = el.dataset.sug; if (el.dataset.sug === 'อนุมัติ' && !$('#dAp').value) $('#dAp').value = iso(today()); return; }
      sb.status = $('#dSt').value; sb.approved_date = $('#dAp').value || (sb.status === 'อนุมัติ' ? iso(today()) : ''); sb.remark = $('#dRm').value.trim(); sb.updated = new Date().toISOString();
      await DB.put('submittals', sb); toast('บันทึกผลพิจารณาแล้ว'); render();
    }
  } catch (err) { toast(err.message, true); }
});
document.addEventListener('keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('pcard')) { e.preventDefault(); e.target.click(); } });
var _qT = null;
document.addEventListener('input', function (e) {
  var t = e.target;
  if (t.id === 'tq') { clearTimeout(_qT); _qT = setTimeout(function () { TF.q = t.value; render().then(function () { var q = $('#tq'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }); }, 300); return; }
  if (t.dataset.dd && S.dailyDraft) { S.dailyDraft[t.id.replace(/^d_/, '')] = t.value; dailyChanged(); return; }
  if (t.dataset.l && S.dailyDraft) { var row = S.dailyDraft[t.dataset.l][+t.dataset.i]; if (t.dataset.f === 'n') row[t.dataset.l === 'manpower' ? 'trade' : 'name'] = t.value; else row.count = t.value;
    var ms = $('#manSum'); if (ms) ms.textContent = 'รวม ' + manTotal(S.dailyDraft) + ' คน'; dailyChanged(); return; }
  if (t.dataset.wd && S.weekDraft && t.type !== 'checkbox') { S.weekDraft[t.dataset.wd] = t.value; weeklyChanged(); return; }
});
document.addEventListener('change', async function (e) {
  var t = e.target;
  try {
    if (t.dataset.up) { var n = await addFiles(t.dataset.up, t.dataset.ref, t.files, t.dataset.pdf === '1'); if (n && t.dataset.up === 'daily' && !S.dailySaved) await saveDaily(); render(); return; }
    if (t.dataset.cap) { var f = S.files.filter(function (x) { return x.id === t.dataset.cap; })[0]; if (f) { f.caption = t.value.trim(); await DB.put('files', f); toast('บันทึกคำอธิบายแล้ว'); } return; }
    if (t.dataset.dd && S.dailyDraft && t.tagName === 'SELECT') { S.dailyDraft[t.id] = t.value; await saveDaily(); return; }
    if (t.dataset.dp) { await setDailyProgress(t.dataset.dp, S.dailyDraft.date, num(t.value)); t.style.borderColor = 'var(--pri2)'; t.style.fontWeight = '700'; toast('บันทึกผลงาน ' + num(t.value) + '% แล้ว'); return; }
    if (t.dataset.wd === 'final' && S.weekDraft) { S.weekDraft.final = t.checked; await saveWeekly(); return; }
    if (t.dataset.chk || t.dataset.cnote != null) {
      var s = S.submittals.filter(function (x) { return x.id === S.route[3]; })[0]; s.checks = s.checks || {};
      var key = t.dataset.chk || t.dataset.cnote, c = s.checks[key] = s.checks[key] || {};
      if (t.dataset.chk) { c.v = t.value; t.className = 'i v-' + t.value; } else c.note = t.value.trim();
      s.updated = new Date().toISOString(); await DB.put('submittals', s); return;
    }
    if (t.id === 'restoreFile' && t.files[0]) { await doRestore(t.files[0]); t.value = ''; return; }
  } catch (err) { toast(err.message, true); }
});
window.addEventListener('hashchange', function () {
  var pend = [];
  if (_dTimer) { clearTimeout(_dTimer); _dTimer = null; pend.push(saveDaily()); }
  if (_wTimer) { clearTimeout(_wTimer); _wTimer = null; pend.push(saveWeekly()); }
  Promise.all(pend).then(function () { S.dailyDraft = null; S.weekDraft = null; render(); window.scrollTo(0, 0); });
});
$('#brand').addEventListener('click', function () { go('/'); });
$('#syncBtn').addEventListener('click', function () { syncNow(true); });
$('#installBtn').addEventListener('click', function () { doInstall().catch(function (e) { toast(e.message, true); }); });
if (!isStandalone()) $('#installBtn').classList.remove('hidden');
$('#menuBtn').addEventListener('click', function () {
  var inP = !!S.P, pid = inP ? S.P.id : '';
  var b = function (go_, t) { return '<button class="btn sec" style="width:100%;text-align:left;margin-bottom:6px" ' + go_ + '>' + t + '</button>'; };
  var bg = modal('<h2>เมนู</h2>' + b('data-go="/"', ic('folder') + ' โครงการทั้งหมด') + (inP ? b('data-go="/p/' + pid + '/set"', ic('settings') + ' ตั้งค่าโครงการนี้') + b('data-act="exportV4"', ic('excel') + ' ส่งออกรายงาน Excel (รูปแบบ v4)') + b('data-act="exportXlsx"', ic('download') + ' ส่งออกข้อมูลดิบ Excel') : '') +
    b('data-act="backup"', ic('backup') + ' สำรองข้อมูลทั้งหมด') + b('data-go="/app"', ic('settings') + ' ตั้งค่าแอป / AI / กู้คืน / ติดตั้ง'));
  bg.addEventListener('click', function (e) { if (e.target.closest('[data-go],[data-act]')) setTimeout(function () { bg.remove(); }, 0); });
});
window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); S.deferredInstall = e; $('#installBtn').classList.remove('hidden'); });
window.addEventListener('appinstalled', function () { S.deferredInstall = null; $('#installBtn').classList.add('hidden'); toast('ติดตั้งแอปแล้ว – เปิดจากไอคอนบนหน้าจอ/เดสก์ท็อปได้เลย', false, 5000); });

/* ---------------- SAMPLE PROJECT ---------------- */
async function createSample(kind) {
  kind = kind || 'behind';
  var t0 = today(), start = addDays(t0, -119), sd = function (n) { return iso(addDays(start, n)); };
  var pid = uid(), P = ['งานถมดินและปรับพื้นที่', 'งานก่อสร้างอาคาร', 'งานรางระบายน้ำ', 'งานถนนและลาน', 'งานรั้ว', 'งานโรงจอดรถ'], C = ['งานเตรียมการ', 'งานดิน', 'งานโครงสร้าง', 'งานสถาปัตยกรรม', 'งานระบบ', 'งานภายนอก'];
  var SNAME = { behind: '(ตัวอย่าง) ล่าช้ากว่าแผน – ก่อสร้างอาคารพร้อมงานภายนอก', ontrack: '(ตัวอย่าง) ตามแผน – ก่อสร้างอาคารพร้อมงานภายนอก', ahead: '(ตัวอย่าง) เร็วกว่าแผน – ก่อสร้างอาคารพร้อมงานภายนอก' };
  var p = { id: pid, name: SNAME[kind] || SNAME.behind, type: 'multi', employer: '(ตัวอย่าง) หน่วยงานผู้ว่าจ้าง', contractor: '(ตัวอย่าง) หจก.ผู้รับจ้าง', contract_no: 'ตย. 01/2569',
    contract_date: sd(-7), bac: '24200000', start: iso(start), duration: '300', eot_days: '0', org: '(ตัวอย่าง) กองช่าง', doc_prefix: 'ตย 0001/2569', supervisor_name: 'นายช่างผู้ควบคุมงาน', supervisor_pos: 'ผู้ควบคุมงาน',
    chair: 'ประธานกรรมการตรวจรับ', member1: 'กรรมการ 1', member2: 'กรรมการ 2', parts: P, cats: C, created: new Date().toISOString(), updated: new Date().toISOString() };
  var T = [[0, 0, 'งานเตรียมพื้นที่ รื้อถอน', 350000, 0, 19, 100, 2, 24], [0, 1, 'งานถมดินและบดอัดแน่น', 2400000, 14, 75, 100, 17, 90], [0, 1, 'งานปรับระดับและทดสอบความแน่น', 300000, 70, 91, 80, 88],
    [1, 2, 'งานเสาเข็มอาคาร', 1800000, 92, 136, 35, 99], [1, 2, 'งานฐานราก คานคอดิน พื้นชั้นล่าง', 1500000, 122, 167, 0], [1, 2, 'งานโครงสร้างชั้น 1–2', 3200000, 153, 228, 0],
    [1, 3, 'งานหลังคา', 1100000, 214, 254, 0], [1, 3, 'งานผนังและฉาบปูน', 1600000, 197, 272, 0], [1, 3, 'งานพื้น ฝ้า สี ประตูหน้าต่าง', 2200000, 245, 292, 0], [1, 4, 'งานระบบไฟฟ้า ประปา', 1500000, 183, 287, 0],
    [1, 4, 'ทดสอบระบบและส่งมอบ', 300000, 282, 299, 0], [2, 2, 'งานวางรางระบายน้ำ คสล.', 1300000, 61, 121, 55, 70], [2, 2, 'งานบ่อพักและท่อลอด', 600000, 92, 152, 0],
    [3, 1, 'งานชั้นรองพื้นทาง', 900000, 122, 167, 0], [3, 2, 'งานถนนและลาน คสล.', 2100000, 162, 228, 0], [3, 5, 'งานขอบคันหินและตีเส้น', 250000, 223, 244, 0],
    [4, 2, 'งานฐานรากและเสารั้ว', 700000, 92, 136, 30, 103], [4, 3, 'งานผนังรั้วและประตูรั้ว', 900000, 131, 197, 0], [5, 2, 'งานฐานรากโรงจอดรถ', 450000, 183, 213, 0],
    [5, 3, 'งานหลังคาโรงจอดรถ', 550000, 214, 259, 0], [5, 4, 'งานไฟฟ้าโรงจอดรถ', 200000, 254, 282, 0]];
  var tasks = [], prog = [], now = new Date().toISOString();
  if (kind !== 'behind') T = T.map(function (x) {
    // ตามแผน: % จริง = % แผน ณ วันนี้ • เร็วกว่าแผน: นำหน้าแผนและเริ่มงานถัดไปก่อนกำหนด
    var s = x[4], f = x[5], d = 119, pl = d >= f ? 1 : d < s ? 0 : (d - s + 1) / (f - s + 1);
    var v = kind === 'ontrack' ? Math.round(pl * 100) : Math.min(100, Math.round(pl * 100 * 1.2 + (pl === 0 && s - d <= 12 ? 20 : 0) + (pl > 0 && pl < 1 ? 8 : 0)));
    if (kind === 'ahead' && pl >= 0.85) v = 100;
    if (v <= 0) return [x[0], x[1], x[2], x[3], s, f, 0];
    var as = Math.min(s, d - 1) + (kind === 'ahead' ? -2 : 0), af = v >= 100 ? Math.min(d, kind === 'ahead' ? f - 4 : f) : null;
    return af != null ? [x[0], x[1], x[2], x[3], s, f, v, Math.max(0, Math.min(as, af - 1)), af] : [x[0], x[1], x[2], x[3], s, f, v, Math.max(0, as)];
  });
  T.forEach(function (x, i) {
    var t = { id: pid + 't' + i, projectId: pid, part: P[x[0]], cat: C[x[1]], desc: x[2], boq: String(x[3]), weight: '', bs: sd(x[4]), bf: sd(x[5]), pct: x[6], order: i + 1, updated: now };
    if (x[6] > 0) {
      t.as = sd(x[7]); if (x[6] >= 100) t.af = sd(x[8]);
      var a = x[7], b = x[6] >= 100 ? x[8] : 119;
      for (var dd = a + 3, k = 0; dd <= b; dd += 4, k++) { var v = Math.min(x[6], Math.round(x[6] * (dd - a) / Math.max(1, b - a))); prog.push({ id: t.id + 'p' + k, projectId: pid, taskId: t.id, date: sd(dd), pct: v, source: 'manual', ts: k }); }
      prog.push({ id: t.id + 'pz', projectId: pid, taskId: t.id, date: sd(b), pct: x[6], source: 'manual', ts: 999 });
    }
    tasks.push(t);
  });
  var pic = function (title, kind) {
    var c = document.createElement('canvas'); c.width = 1200; c.height = 900; var g = c.getContext('2d');
    var sky = g.createLinearGradient(0, 0, 0, 500); sky.addColorStop(0, '#8fb8e8'); sky.addColorStop(1, '#dbe8f5'); g.fillStyle = sky; g.fillRect(0, 0, 1200, 520);
    g.fillStyle = kind ? '#9a8a70' : '#8a6d4b'; g.fillRect(0, 520, 1200, 380); g.fillStyle = '#b9b9b9';
    if (kind) { g.fillRect(100, 600, 1000, 90); } else { for (var i = 0; i < 6; i++) g.fillRect(170 + i * 160, 380, 40, 230); g.fillStyle = '#e0a020'; g.fillRect(840, 120, 30, 420); g.fillRect(760, 120, 240, 26); }
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, 800, 1200, 100); g.fillStyle = '#fff'; g.font = 'bold 54px THSarabunPSK, Tahoma, sans-serif'; g.fillText('ภาพตัวอย่าง: ' + title, 30, 865);
    return new Promise(function (res) { c.toBlob(function (b) { res(b); }, 'image/jpeg', 0.8); });
  };
  var daily = [], files = [];
  for (var k = 5; k >= 0; k--) {
    var d = addDays(t0, -k); if (d.getDay() === 0) continue;
    var rain = k === 3, di = iso(d);
    daily.push({ id: pid + '_' + di, projectId: pid, date: di, weatherAM: rain ? 'ฝนตกหนัก' : 'แจ่มใส', weatherPM: rain ? 'ฝนเล็กน้อย' : 'มีเมฆ', status: rain ? 'หยุดงาน (ฝนตก)' : 'ทำงานได้ตามปกติ',
      manpower: rain ? [{ trade: 'โฟร์แมน', count: 1 }] : [{ trade: 'โฟร์แมน', count: 1 }, { trade: 'ช่างเหล็ก', count: 6 }, { trade: 'ช่างปูน', count: 5 }, { trade: 'กรรมกร', count: 14 + k }],
      machinery: rain ? [] : [{ name: 'ปั้นจั่นตอกเข็ม', count: 1 }, { name: 'รถแบ็คโฮ', count: 2 }],
      work: rain ? 'หยุดงานเนื่องจากฝนตกหนัก' : 'ตอกเสาเข็มอาคาร ' + (4 + k) + ' ต้น • วางรางระบายน้ำ คสล. ' + (10 + k * 2) + ' ม. • หล่อฐานรากรั้ว ' + (2 + k % 3) + ' ฐาน',
      materials: k === 2 ? 'เหล็ก DB16 จำนวน 12 ตัน' : '', tests: k === 1 ? 'เก็บตัวอย่างคอนกรีตรางระบายน้ำ 6 ก้อน' : '', issues: k === 1 ? 'ยังไม่ได้รับแบบแก้ไขบ่อพักจากผู้ว่าจ้าง' : '',
      instructions: k === 1 ? 'ให้ผู้รับจ้างเพิ่มชุดทำงานรางระบายน้ำอีก 1 ชุด' : '', updated: now });
    if (!rain && k <= 2) {
      files.push({ id: pid + 'f' + k + 'a', projectId: pid, kind: 'daily', ref: di, caption: 'งานตอกเสาเข็มอาคาร', mime: 'image/jpeg', name: 'pile.jpg', blob: await pic('งานตอกเสาเข็มอาคาร', 0), created: now });
      files.push({ id: pid + 'f' + k + 'b', projectId: pid, kind: 'daily', ref: di, caption: 'งานวางรางระบายน้ำ', mime: 'image/jpeg', name: 'drain.jpg', blob: await pic('งานวางรางระบายน้ำ', 1), created: now });
    }
  }
  files.forEach(function (f) { f.size = f.blob.size; });
  var subs = [{ id: pid + 's1', projectId: pid, doc_no: 'SM-001', material: 'คอนกรีตผสมเสร็จ 240 ksc', brand: '(ตัวอย่าง) ยี่ห้อ A', taskId: pid + 't4', lead_days: '7', spec_sec: '03 31 00', submitted_date: sd(105), status: 'อนุมัติ', approved_date: sd(110), checks: {}, updated: now },
    { id: pid + 's2', projectId: pid, doc_no: 'SM-002', material: 'เหล็กข้ออ้อย SD40', brand: '(ตัวอย่าง) ยี่ห้อ B', taskId: pid + 't4', lead_days: '14', spec_sec: '03 21 00', submitted_date: sd(108), status: 'ขอเอกสารเพิ่มเติม', remark: 'ขอใบ Mill Certificate', checks: {}, updated: now }];
  var cr = criteriaOf(subs[1]); if (cr[0]) subs[1].checks[cr[0].key] = { v: 'ผ่าน', note: 'แคตตาล็อกระบุ มอก. 24 ชั้นคุณภาพ SD40' }; if (cr[1]) subs[1].checks[cr[1].key] = { v: 'ไม่พบข้อมูล', note: 'ไม่มีใบรับรองผลการทดสอบ' };
  p.fin = { adv: 15, ret: 5, kUse: true, kThr: 4, k: K_DEFAULT, ldRate: 0.10, ldMin: 100, ldCap: 10 };
  var inst = [['1', 'งานถมดินและปรับพื้นที่แล้วเสร็จทั้งหมด', 12, 91, 3630000, [104.2, 101.5, 106.8, 112.0]], ['2', 'งานรางระบายน้ำ เสาเข็มอาคาร ฐานรากรั้วแล้วเสร็จ', 30, 152, 4840000],
    ['3', 'งานโครงสร้างอาคาร ถนน-ลาน และรั้วแล้วเสร็จ', 60, 228, 6050000], ['4', 'งานสถาปัตยกรรมอาคารและโรงจอดรถแล้วเสร็จ', 85, 272, 4840000], ['5', 'งานทั้งหมดแล้วเสร็จ ทดสอบระบบ ส่งมอบงาน', 100, 299, 4840000]]
    .map(function (x, i) { return { id: pid + 'i' + i, projectId: pid, no: x[0], scope: x[1], req_pct: String(x[2]), due: sd(x[3]), amount: String(x[4]), it: x[5] || null, updated: now }; });
  var vos = [{ id: pid + 'v1', projectId: pid, doc_no: 'VO-01/2569', date: sd(96), desc: 'แก้ไขแบบบ่อพักและท่อลอด เพิ่มบ่อพัก 4 บ่อ', taskId: pid + 't12', type: 'งานเพิ่ม', amount: '380000', status: 'อนุมัติ', approved_amount: '352000', approved_date: sd(111), days: '8', updated: now },
    { id: pid + 'v2', projectId: pid, doc_no: 'VO-02/2569', date: sd(109), desc: 'ปรับลดความยาวรั้วด้านทิศเหนือ 40 ม.', taskId: pid + 't17', type: 'งานลด', amount: '120000', status: 'รอพิจารณา', updated: now }];
  if (kind === 'ahead') { inst[0].submitted = sd(88); inst[0].accepted = sd(93); }
  if (kind === 'ontrack') { inst[0].submitted = sd(91); inst[0].accepted = sd(97); }
  var eots = kind !== 'behind' ? [] : [{ id: pid + 'e1', projectId: pid, date: sd(96), desc: 'ผู้ว่าจ้างแก้ไขแบบบ่อพักและท่อลอด', taskId: pid + 't12', cause: 'ผู้ว่าจ้าง', days_claimed: '10', letter_ref: 'ผร.002/2569', submitted: sd(101), status: 'อนุมัติบางส่วน', days_approved: '8', updated: now },
    { id: pid + 'e2', projectId: pid, date: sd(57), desc: 'ฝนตกหนักต่อเนื่อง บดอัดดินไม่ได้', cause: 'เหตุสุดวิสัย', days_claimed: '7', letter_ref: 'ผร.001/2569', submitted: sd(63), status: 'รอพิจารณา', updated: now }];
  if (kind !== 'behind') vos = vos.slice(0, 1);
  await DB.put('projects', p); await DB.putMany('tasks', tasks); await DB.putMany('installments', inst); await DB.putMany('vos', vos); await DB.putMany('eots', eots); await DB.putMany('progress', prog); await DB.putMany('daily', daily); await DB.putMany('files', files); await DB.putMany('submittals', subs);
  toast('สร้างโครงการตัวอย่างแล้ว'); return pid;
}

/* ---------------- START ---------------- */
function registerSW() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:' || /claudeusercontent|claude\.ai/.test(location.host)) return;
  navigator.serviceWorker.register('sw.js').then(function (reg) {
    reg.addEventListener('updatefound', function () {
      var nw = reg.installing; if (!nw) return;
      nw.addEventListener('statechange', function () {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) {
          var bn = document.createElement('div'); bn.className = 'toast'; bn.innerHTML = 'มีเวอร์ชันใหม่ <button class="btn sm" id="updNow" style="margin-left:8px">อัปเดต</button>'; document.body.appendChild(bn);
          $('#updNow').onclick = function () { nw.postMessage('skipWaiting'); };
        }
      });
    });
  }).catch(function (e) { console.warn('SW', e); });
  // โหลดหน้าใหม่เฉพาะเมื่อ "อัปเดตจากเวอร์ชันเดิม" (ไม่โหลดใหม่ตอนติดตั้งครั้งแรก เพื่อไม่ให้ข้อมูลที่กำลังกรอกหาย)
  var hadController = !!navigator.serviceWorker.controller, reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', function () { if (hadController && !reloaded) { reloaded = true; location.reload(); } });
}
(async function start() {
  try { await openDB(); } catch (e) { $('#main').innerHTML = '<div class="card"><h2>เปิดฐานข้อมูลไม่ได้</h2><p>' + esc(e.message) + '</p><p class="muted">ถ้าใช้โหมดไม่ระบุตัวตน (Incognito) ให้เปิดแบบปกติ</p></div>'; return; }
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persisted().then(function (p) { if (!p) navigator.storage.persist(); }); } catch (e) {}
  registerSW();
  var tries = 0; while (!window.Chart && tries++ < 20) await new Promise(function (r) { setTimeout(r, 50); });
  if (window.Chart) { Chart.defaults.font.family = "'THSarabunPSK','TH SarabunPSK','TH Sarabun PSK',sans-serif"; Chart.defaults.font.size = 16; }
  try { if (document.fonts && document.fonts.load) await Promise.race([document.fonts.load("20px THSarabunPSK"), new Promise(function (r) { setTimeout(r, 1500); })]); } catch (e) {}
  await render();
  syncBadge(); outboxAll().then(function (a) { SYNC.pending = a.length; syncBadge(); }).catch(function () {}); scheduleSync(1200);
})();

/* ---------------- CONTRACT & FINANCE ---------------- */
var EOT_CAUSE = ['ผู้ว่าจ้าง', 'เหตุสุดวิสัย', 'ผู้รับจ้าง', 'อื่นๆ'];
var EOT_ST = ['รอพิจารณา', 'อนุมัติ', 'อนุมัติบางส่วน', 'ไม่อนุมัติ'];
var VO_ST = ['รอพิจารณา', 'อนุมัติ', 'ไม่อนุมัติ'];
function sortedInst() { return S.installments.slice().sort(function (a, b) { return num(a.no) - num(b.no); }); }
async function vFin(args) {
  var tab = args[0] || 'inst', p = S.P, L = ldInfo(), pid = p.id;
  var tabs = [['inst', 'งวดงานและเงินงวด'], ['vo', 'งานเพิ่ม-ลด (VO)'], ['eot', 'ขยายเวลาและค่าปรับ']];
  var h = pageHead('สัญญาและการเงิน', 'มูลค่าสัญญา งวดงาน การเบิกจ่าย งานเพิ่ม-ลด และการขยายเวลา',
    '<button class="btn sec" data-act="finSet">' + ic('settings') + 'เงื่อนไขสัญญา</button>') +
    '<div class="kpis">' + kpi('มูลค่าสัญญาเดิม', money(p.bac)) + kpi('งานเพิ่ม-ลดสุทธิ', (voNet() >= 0 ? '+' : '') + money(voNet()), 'เฉพาะที่อนุมัติ', voNet() < 0 ? 'bad-t' : '') +
    kpi('มูลค่าสัญญาปัจจุบัน', money(num(p.bac) + voNet())) + kpi('สิ้นสุดสัญญา', th(projEnd(), true), 'รวมขยายเวลา ' + eotTotal() + ' วัน') +
    kpi('ค่าปรับคาดการณ์', L.fLd == null ? '-' : money(L.fLd), L.fDelay ? 'ช้ากว่าสัญญา ' + L.fDelay + ' วัน' : 'คาดว่าทันสัญญา', L.fDelay ? 'bad-t' : 'ok-t') + '</div>' +
    '<div class="tabs" role="tablist">' + tabs.map(function (t) { return '<button role="tab" aria-selected="' + (t[0] === tab) + '" class="' + (t[0] === tab ? 'on' : '') + '" data-go="/p/' + pid + '/fin/' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>';
  return h + ({ inst: finInst, vo: finVO, eot: finEOT }[tab] || finInst)();
}
function finInst() {
  var list = sortedInst(), ac = actualNow(), F = fin(), tot = { amt: 0, kadj: 0, adv: 0, ret: 0, ld: 0, net: 0 };
  var h = '<div class="card"><div class="card-h"><h2>งวดงานตามสัญญา</h2><button class="btn" data-inst="">' + ic('plus') + 'เพิ่มงวด</button></div>' +
    '<p class="muted">เงินล่วงหน้า ' + F.adv + '% • ประกันผลงาน ' + F.ret + '% • ค่า K: ' + (F.kUse ? 'ใช้ (คิดส่วนที่เกิน ±' + F.kThr + '%)' : 'ไม่ใช้') + ' • ยอดสุทธิยังไม่รวมภาษี</p>';
  if (!list.length) return h + '<div class="empty">ยังไม่มีงวดงาน – กด "เพิ่มงวด" เพื่อบันทึกตามสัญญา</div></div>';
  h += '<div class="tw"><table class="tbl"><thead><tr><th>งวด</th><th>เนื้องาน</th><th>กำหนดเสร็จ</th><th class="num">มูลค่างาน</th><th>เกณฑ์ผลงาน</th><th>สถานะ</th><th class="num">ค่า K</th><th class="num">เงิน K</th><th class="num">หักล่วงหน้า</th><th class="num">หักประกัน</th><th class="num">ค่าปรับ</th><th class="num">สุทธิ</th><th class="noprint"></th></tr></thead><tbody>';
  list.forEach(function (i) {
    var p = payOf(i), rq = i.req_pct !== '' && i.req_pct != null ? (ac * 100 >= num(i.req_pct) ? { k: 'ok', t: 'ถึงเกณฑ์ ' + num(i.req_pct) + '%' } : { k: 'na', t: 'ขาด ' + (num(i.req_pct) - ac * 100).toFixed(2) + '%' }) : { k: 'na', t: '-' };
    ['amt', 'kadj', 'adv', 'ret', 'ld', 'net'].forEach(function (x) { tot[x] += p[x]; });
    h += '<tr><td>' + esc(i.no) + '</td><td>' + esc(i.scope) + (num(i.vo_amount) ? '<div class="muted">รวม VO ' + money(i.vo_amount) + '</div>' : '') + '</td><td>' + th(i.due, true) +
      (i.submitted ? '<div class="muted">ส่งมอบ ' + th(i.submitted, true) + '</div>' : '') + (i.accepted ? '<div class="muted">ตรวจรับ ' + th(i.accepted, true) + '</div>' : '') + '</td>' +
      '<td class="num">' + money(p.amt) + '</td><td>' + badge(rq) + '</td><td>' + badge(instStatus(i)) + '</td><td class="num">' + (p.K == null ? '-' : p.K.toFixed(4)) + '</td>' +
      '<td class="num ' + (p.kadj < 0 ? 'bad-t' : p.kadj > 0 ? 'ok-t' : '') + '">' + (p.K == null ? '-' : money(p.kadj)) + '</td><td class="num">' + money(p.adv) + '</td><td class="num">' + money(p.ret) + '</td>' +
      '<td class="num">' + money(p.ld) + '</td><td class="num"><b>' + money(p.net) + '</b></td><td class="noprint nowrap"><button class="btn sm sec" data-inst="' + i.id + '">แก้ไข</button> ' +
      '<button class="btn sm ghost" data-go="/p/' + S.P.id + '/print/pay/' + i.id + '" title="พิมพ์ใบสรุปเงินงวด">' + ic('print') + '</button></td></tr>';
  });
  h += '</tbody><tfoot><tr><td colspan="3">รวม</td><td class="num">' + money(tot.amt) + '</td><td></td><td></td><td></td><td class="num">' + money(tot.kadj) + '</td><td class="num">' + money(tot.adv) + '</td><td class="num">' + money(tot.ret) + '</td><td class="num">' + money(tot.ld) + '</td><td class="num">' + money(tot.net) + '</td><td class="noprint"></td></tr></tfoot></table></div>';
  var diff = tot.amt - list.reduce(function (a, i) { return a + num(i.vo_amount); }, 0) - num(S.P.bac);
  if (Math.abs(diff) >= 1 && num(S.P.bac)) h += '<p class="bad-t">ยอดรวมงวด (ไม่รวม VO) ต่างจากมูลค่าสัญญา ' + money(diff) + ' บาท</p>';
  var accAdv = list.filter(function (i) { return i.accepted; }).reduce(function (a, i) { return a + payOf(i).adv; }, 0);
  var accRet = list.filter(function (i) { return i.accepted; }).reduce(function (a, i) { return a + payOf(i).ret; }, 0);
  h += '<div class="kpis" style="margin-top:12px">' + kpi('เงินล่วงหน้าคงเหลือ', money(num(S.P.bac) * F.adv / 100 - accAdv), 'หลังงวดที่ตรวจรับแล้ว') + kpi('เงินประกันผลงานที่หักไว้', money(accRet), 'งวดที่ตรวจรับแล้ว') +
    kpi('จ่ายสุทธิแล้ว', money(list.filter(function (i) { return i.accepted; }).reduce(function (a, i) { return a + payOf(i).net; }, 0)), list.filter(function (i) { return i.accepted; }).length + ' งวด') + '</div>';
  return h + '</div>';
}
function finVO() {
  var list = S.vos.slice().sort(function (a, b) { return (a.date || '') < (b.date || '') ? -1 : 1; });
  var h = '<div class="card"><div class="card-h"><h2>ทะเบียนงานเพิ่ม-ลด</h2><button class="btn" data-vo="">' + ic('plus') + 'บันทึกงานเพิ่ม-ลด</button></div>' +
    '<p class="muted">เฉพาะรายการที่อนุมัติจะปรับมูลค่าสัญญา • งานเพิ่มที่อนุมัติควรเพิ่มเป็นรายการงานใหม่ในแผนงานด้วย • ถ้ากระทบเวลา ให้บันทึกขอขยายเวลา</p>';
  if (!list.length) return h + '<div class="empty">ยังไม่มีรายการ</div></div>';
  h += '<div class="tw"><table class="tbl"><thead><tr><th>เลขที่</th><th>วันที่</th><th>รายละเอียด</th><th>ประเภท</th><th class="num">เสนอ</th><th class="num">อนุมัติ</th><th>ผลพิจารณา</th><th class="noprint"></th></tr></thead><tbody>';
  list.forEach(function (v) { var t = taskById(v.taskId);
    h += '<tr><td>' + esc(v.doc_no) + '</td><td>' + th(v.date, true) + '</td><td>' + esc(v.desc) + (t ? '<div class="muted">' + esc(wbsOf(t.id) + ' ' + t.desc) + '</div>' : '') + (num(v.days) ? '<div class="muted">ผลต่อเวลา ' + num(v.days) + ' วัน</div>' : '') + '</td>' +
      '<td>' + esc(v.type) + '</td><td class="num">' + money(v.amount) + '</td><td class="num">' + (v.status === 'อนุมัติ' ? money(v.approved_amount !== '' && v.approved_amount != null ? v.approved_amount : v.amount) : '-') + '</td>' +
      '<td>' + badge({ k: v.status === 'อนุมัติ' ? 'ok' : v.status === 'ไม่อนุมัติ' ? 'bad' : 'warn', t: v.status }) + '</td><td class="noprint"><button class="btn sm sec" data-vo="' + v.id + '">แก้ไข</button></td></tr>'; });
  return h + '</tbody></table></div></div>';
}
function finEOT() {
  var L = ldInfo(), F = fin(), list = S.eots.slice().sort(function (a, b) { return (a.date || '') < (b.date || '') ? -1 : 1; });
  var pend = list.filter(function (e) { return e.status === 'รอพิจารณา'; }).reduce(function (a, e) { return a + num(e.days_claimed); }, 0);
  var h = '<div class="card"><h2>ค่าปรับ (Liquidated Damages)</h2><div class="kpis">' +
    kpi('ค่าปรับต่อวัน', money(L.per), 'อัตรา ' + F.ldRate + '% ขั้นต่ำ ' + money(F.ldMin)) +
    kpi('ค่าปรับเกิดขึ้นแล้ว', money(L.incurred), L.late ? 'เลยกำหนด ' + L.late + ' วัน' : 'ยังไม่ถึงกำหนดสัญญา', L.late ? 'bad-t' : 'ok-t') +
    kpi('คาดว่าแล้วเสร็จ', L.fEnd ? th(L.fEnd, true) : '-', 'วิธี Earned Schedule • SPI(t) ' + (L.spit ? L.spit.toFixed(2) : '-')) +
    kpi('ค่าปรับคาดการณ์', L.fLd == null ? '-' : money(L.fLd), L.overCap ? 'เกิน ' + F.ldCap + '% ของสัญญา – เสี่ยงถูกบอกเลิก' : (L.fDelay ? 'ช้ากว่าสัญญา ' + L.fDelay + ' วัน' : ''), L.fDelay ? 'bad-t' : 'ok-t') + '</div>' +
    '<p class="muted">คาดการณ์ด้วยวิธี Earned Schedule (เทียบผลงานจริงกับเส้นแผน) ใช้เป็นสัญญาณเตือนล่วงหน้า ไม่ใช่ยอดที่เรียกเก็บจริง</p></div>';
  h += '<div class="card"><div class="card-h"><h2>ทะเบียนขอขยายเวลา</h2><button class="btn" data-eot="">' + ic('plus') + 'บันทึกเหตุการณ์ล่าช้า</button></div>' +
    '<p class="muted">อนุมัติแล้ว <b>' + eotApproved() + '</b> วัน' + (num(S.P.eot_days) ? ' (+ นอกทะเบียน ' + num(S.P.eot_days) + ' วัน)' : '') + ' • รอพิจารณา <b>' + pend + '</b> วัน • วันที่อนุมัติจะเลื่อนวันสิ้นสุดสัญญาอัตโนมัติ</p>';
  if (!list.length) return h + '<div class="empty">ยังไม่มีรายการ</div></div>';
  h += '<div class="tw"><table class="tbl"><thead><tr><th>วันที่</th><th>เหตุการณ์</th><th>สาเหตุจาก</th><th class="num">ขอ (วัน)</th><th>เลขที่หนังสือ</th><th>ผลพิจารณา</th><th class="num">อนุมัติ (วัน)</th><th class="noprint"></th></tr></thead><tbody>';
  list.forEach(function (e) { var ok = e.status === 'อนุมัติ' || e.status === 'อนุมัติบางส่วน';
    h += '<tr><td>' + th(e.date, true) + '</td><td>' + esc(e.desc) + (e.cause === 'ผู้รับจ้าง' ? '<div class="muted bad-t">ผู้รับจ้างรับผิดชอบ – ไม่มีสิทธิ์ขยายเวลา</div>' : '') + '</td><td>' + esc(e.cause) + '</td><td class="num">' + num(e.days_claimed) + '</td><td>' + esc(e.letter_ref) + '</td>' +
      '<td>' + badge({ k: ok ? 'ok' : e.status === 'ไม่อนุมัติ' ? 'bad' : 'warn', t: e.status }) + '</td><td class="num">' + (e.days_approved !== '' && e.days_approved != null ? num(e.days_approved) : '-') + '</td><td class="noprint"><button class="btn sm sec" data-eot="' + e.id + '">แก้ไข</button></td></tr>'; });
  return h + '</tbody></table></div></div>';
}
function taskOpts(cur) { return opts(wbsList().map(function (o) { return [o.t.id, o.wbs + ' ' + o.t.desc]; }), cur, '- ไม่ระบุ -'); }
function delRecBtn(store, list, id, label) {
  return function (bg) { var b = bg.querySelector('#recDel'); if (!b) return;
    b.onclick = async function () { if (!(await confirmBox('ลบ' + label + 'นี้?', 'ลบ'))) return;
      await DB.del(store, id); S[list] = S[list].filter(function (x) { return x.id !== id; }); bg.remove(); toast('ลบแล้ว'); render(); }; };
}
async function saveRec(store, list, o) { o.projectId = S.P.id; o.updated = new Date().toISOString(); await DB.put(store, o); var i = S[list].findIndex(function (x) { return x.id === o.id; }); if (i >= 0) S[list][i] = o; else S[list].push(o); toast('บันทึกแล้ว'); render(); }
function openInst(id) {
  var i = id ? S.installments.filter(function (x) { return x.id === id; })[0] : { no: String(S.installments.length + 1) }, F = fin(), k = F.k, it = i.it || [];
  var kHtml = F.kUse ? '<div class="sec-h">ดัชนีราคาเดือนส่งมอบงาน (It) สำหรับค่า K</div><div class="grid3">' + [0, 1, 2, 3, 4].filter(function (x) { return num(k.c[x]) > 0; }).map(function (x) {
    return inp('it' + x, esc(k.n[x] || ('ดัชนี ' + (x + 1))) + ' (ฐาน ' + num(k.io[x]) + ')', it[x] == null ? '' : it[x], '', 'inputmode="decimal"'); }).join('') + '</div>' : '';
  var bg = modal('<h2>' + (id ? 'งวดที่ ' + esc(i.no) : 'เพิ่มงวดงาน') + '</h2><div class="grid3">' + inp('iNo', 'งวดที่', i.no) + inp('iDue', 'กำหนดแล้วเสร็จ', i.due, 'date') + inp('iReq', 'ผลงานสะสมที่กำหนด (%)', i.req_pct, '', 'inputmode="decimal"') + '</div>' +
    '<label class="f" for="iScope">เนื้องานที่ต้องแล้วเสร็จในงวด</label><textarea id="iScope" class="i" rows="2">' + esc(i.scope) + '</textarea><div class="grid3">' +
    inp('iAmt', 'จำนวนเงินตามสัญญา (บาท)', i.amount, '', 'inputmode="decimal"') + inp('iVo', 'งานเพิ่ม-ลดที่รวมในงวด (บาท)', i.vo_amount, '', 'inputmode="decimal"') + inp('iLd', 'หักค่าปรับในงวด (บาท)', i.ld, '', 'inputmode="decimal"') +
    inp('iSub', 'วันที่ผู้รับจ้างส่งมอบงาน', i.submitted, 'date') + inp('iAcc', 'วันที่คณะกรรมการตรวจรับ', i.accepted, 'date') + '</div>' + kHtml +
    '<label class="f" for="iRm">หมายเหตุ</label><textarea id="iRm" class="i" rows="2">' + esc(i.remark) + '</textarea>' + (id ? '<div style="margin-top:10px"><button class="btn sm bad" id="recDel">ลบงวดนี้</button></div>' : ''),
    async function (bg) {
      var o = Object.assign({}, i, { id: id || uid(), no: val(bg, 'iNo'), due: val(bg, 'iDue'), scope: val(bg, 'iScope'), amount: val(bg, 'iAmt').replace(/,/g, ''), vo_amount: val(bg, 'iVo').replace(/,/g, ''),
        req_pct: val(bg, 'iReq').replace('%', ''), ld: val(bg, 'iLd').replace(/,/g, ''), submitted: val(bg, 'iSub'), accepted: val(bg, 'iAcc'), remark: val(bg, 'iRm') });
      if (!o.no || !o.scope || !o.due || !o.amount) throw new Error('กรอกงวดที่ เนื้องาน กำหนดเสร็จ และจำนวนเงิน');
      if (o.accepted && o.submitted && o.accepted < o.submitted) throw new Error('วันตรวจรับต้องไม่ก่อนวันส่งมอบ');
      if (F.kUse) o.it = [0, 1, 2, 3, 4].map(function (x) { var e = bg.querySelector('#it' + x); return e && e.value.trim() !== '' ? num(e.value) : (it[x] == null ? null : it[x]); });
      await saveRec('installments', 'installments', o);
    }, null, true);
  delRecBtn('installments', 'installments', id, 'งวดงาน')(bg);
}
function openVO(id) {
  var v = id ? S.vos.filter(function (x) { return x.id === id; })[0] : { type: 'งานเพิ่ม', date: iso(today()), status: 'รอพิจารณา' };
  var bg = modal('<h2>' + (id ? 'งานเพิ่ม-ลด ' + esc(v.doc_no) : 'บันทึกงานเพิ่ม-ลด') + '</h2><div class="grid3">' + inp('vDoc', 'เลขที่ VO / หนังสือ', v.doc_no) + inp('vDate', 'วันที่', v.date, 'date') +
    '<div><label class="f" for="vType">ประเภท</label><select id="vType" class="i">' + opts(['งานเพิ่ม', 'งานลด'], v.type) + '</select></div></div>' +
    '<label class="f" for="vDesc">รายละเอียดงานที่เปลี่ยนแปลง</label><textarea id="vDesc" class="i" rows="2">' + esc(v.desc) + '</textarea>' +
    '<div class="grid3">' + inp('vAmt', 'จำนวนเงินที่เสนอ (บาท)', v.amount, '', 'inputmode="decimal"') + inp('vDays', 'ผลต่อระยะเวลา (วัน)', v.days, '', 'inputmode="numeric"') +
    '<div><label class="f" for="vTask">รายการงานที่เกี่ยวข้อง</label><select id="vTask" class="i">' + taskOpts(v.taskId) + '</select></div></div>' +
    '<div class="sec-h">ผลพิจารณา</div><div class="grid3"><div><label class="f" for="vSt">ผลพิจารณา</label><select id="vSt" class="i">' + opts(VO_ST, v.status) + '</select></div>' +
    inp('vApAmt', 'จำนวนเงินที่อนุมัติ (บาท)', v.approved_amount, '', 'inputmode="decimal"') + inp('vApDate', 'วันที่อนุมัติ', v.approved_date, 'date') + '</div>' +
    '<label class="f" for="vRm">หมายเหตุ</label><textarea id="vRm" class="i" rows="2">' + esc(v.remark) + '</textarea>' + (id ? '<div style="margin-top:10px"><button class="btn sm bad" id="recDel">ลบ</button></div>' : ''),
    async function (bg) {
      var o = Object.assign({}, v, { id: id || uid(), doc_no: val(bg, 'vDoc'), date: val(bg, 'vDate'), type: val(bg, 'vType'), amount: val(bg, 'vAmt').replace(/,/g, ''), desc: val(bg, 'vDesc'), taskId: val(bg, 'vTask'),
        days: val(bg, 'vDays'), status: val(bg, 'vSt'), approved_amount: val(bg, 'vApAmt').replace(/,/g, ''), approved_date: val(bg, 'vApDate'), remark: val(bg, 'vRm') });
      if (!o.desc || !o.amount) throw new Error('กรอกรายละเอียดและจำนวนเงิน');
      if (o.status === 'อนุมัติ') { if (o.approved_amount === '') o.approved_amount = o.amount; if (!o.approved_date) o.approved_date = iso(today()); }
      await saveRec('vos', 'vos', o);
    }, null, true);
  delRecBtn('vos', 'vos', id, 'รายการ')(bg);
}
function openEOT(id) {
  var e = id ? S.eots.filter(function (x) { return x.id === id; })[0] : { date: iso(today()), cause: 'เหตุสุดวิสัย', status: 'รอพิจารณา' };
  var bg = modal('<h2>' + (id ? 'เหตุการณ์ล่าช้า' : 'บันทึกเหตุการณ์ล่าช้า / ขอขยายเวลา') + '</h2><div class="grid3">' + inp('eDate', 'วันที่เกิดเหตุ', e.date, 'date') +
    '<div><label class="f" for="eCause">สาเหตุจาก</label><select id="eCause" class="i">' + opts(EOT_CAUSE, e.cause) + '</select></div>' +
    '<div><label class="f" for="eTask">รายการงานที่ได้รับผลกระทบ</label><select id="eTask" class="i">' + taskOpts(e.taskId) + '</select></div></div>' +
    '<label class="f" for="eDesc">รายละเอียดเหตุการณ์</label><textarea id="eDesc" class="i" rows="2">' + esc(e.desc) + '</textarea>' +
    '<div class="grid3">' + inp('eClaim', 'จำนวนวันที่ขอขยาย', e.days_claimed, '', 'inputmode="numeric"') + inp('eRef', 'เลขที่หนังสือ', e.letter_ref) + inp('eSub', 'วันที่ยื่น', e.submitted, 'date') + '</div>' +
    '<div class="sec-h">ผลพิจารณา</div><div class="grid3"><div><label class="f" for="eSt">ผลพิจารณา</label><select id="eSt" class="i">' + opts(EOT_ST, e.status) + '</select></div>' +
    inp('eAp', 'จำนวนวันที่อนุมัติ', e.days_approved, '', 'inputmode="numeric"') + '</div>' +
    '<label class="f" for="eRm">หมายเหตุ</label><textarea id="eRm" class="i" rows="2">' + esc(e.remark) + '</textarea>' +
    '<p class="muted">เหตุที่ผู้รับจ้างต้องรับผิดชอบเองไม่มีสิทธิ์ขยายเวลา • ควรยื่นหนังสือภายในระยะเวลาที่สัญญากำหนด</p>' + (id ? '<div style="margin-top:6px"><button class="btn sm bad" id="recDel">ลบ</button></div>' : ''),
    async function (bg) {
      var o = Object.assign({}, e, { id: id || uid(), date: val(bg, 'eDate'), cause: val(bg, 'eCause'), desc: val(bg, 'eDesc'), taskId: val(bg, 'eTask'), days_claimed: val(bg, 'eClaim'),
        letter_ref: val(bg, 'eRef'), submitted: val(bg, 'eSub'), status: val(bg, 'eSt'), days_approved: val(bg, 'eAp'), remark: val(bg, 'eRm') });
      if (!o.desc || !o.days_claimed) throw new Error('กรอกรายละเอียดและจำนวนวันที่ขอ');
      if (o.status === 'อนุมัติ' && o.days_approved === '') o.days_approved = o.days_claimed;
      if (o.status === 'ไม่อนุมัติ') o.days_approved = '0';
      if (num(o.days_approved) > num(o.days_claimed)) throw new Error('วันที่อนุมัติมากกว่าวันที่ขอ');
      if (o.cause === 'ผู้รับจ้าง' && (o.status === 'อนุมัติ' || o.status === 'อนุมัติบางส่วน') && !(await confirmBox('เหตุจากผู้รับจ้างโดยปกติไม่มีสิทธิ์ขยายเวลา ยืนยันอนุมัติ?', 'ยืนยัน'))) return false;
      await saveRec('eots', 'eots', o);
    }, null, true);
  delRecBtn('eots', 'eots', id, 'รายการ')(bg);
}
function openFinSet() {
  var F = fin(), k = F.k;
  modal('<h2>เงื่อนไขสัญญา</h2><div class="grid3">' + inp('fAdv', 'เงินล่วงหน้า (% ของสัญญา)', F.adv, '', 'inputmode="decimal"') + inp('fRet', 'หักเงินประกันผลงาน (% ต่องวด)', F.ret, '', 'inputmode="decimal"') + '<div></div>' +
    inp('fLdr', 'อัตราค่าปรับ (% ของสัญญาต่อวัน)', F.ldRate, '', 'inputmode="decimal"') + inp('fLdm', 'ค่าปรับขั้นต่ำต่อวัน (บาท)', F.ldMin, '', 'inputmode="decimal"') + inp('fCap', 'เกณฑ์เตือนค่าปรับสะสม (% ของสัญญา)', F.ldCap, '', 'inputmode="decimal"') + '</div>' +
    '<div class="sec-h">ค่า K (สัญญาแบบปรับราคาได้)</div><div class="grid3"><div><label class="f" for="fKu">ใช้ค่า K</label><select id="fKu" class="i">' + opts([['0', 'ไม่ใช้'], ['1', 'ใช้']], F.kUse ? '1' : '0') + '</select></div>' +
    inp('fKt', 'คิดเฉพาะส่วนที่เกิน ± (%)', F.kThr, '', 'inputmode="decimal"') + inp('fKa', 'ค่าคงที่ a', k.a, '', 'inputmode="decimal"') + '</div>' +
    '<div class="tw"><table class="tbl"><thead><tr><th>ชื่อดัชนี</th><th>สัมประสิทธิ์</th><th>ดัชนีฐาน Io (เดือนเปิดซอง)</th></tr></thead><tbody>' + [0, 1, 2, 3, 4].map(function (x) {
      return '<tr><td><input class="i" id="kn' + x + '" value="' + esc(k.n[x]) + '" aria-label="ชื่อดัชนี ' + (x + 1) + '"></td><td><input class="i" id="kc' + x + '" value="' + esc(k.c[x]) + '" inputmode="decimal" aria-label="สัมประสิทธิ์ ' + (x + 1) + '"></td><td><input class="i" id="ki' + x + '" value="' + esc(k.io[x]) + '" inputmode="decimal" aria-label="ดัชนีฐาน ' + (x + 1) + '"></td></tr>'; }).join('') + '</tbody></table></div>' +
    '<p class="muted">ตัวอย่างสูตรงานอาคาร K = 0.25 + 0.15 It/Io + 0.10 Ct/Co + 0.40 Mt/Mo + 0.10 St/So • ต้องใช้สูตรตามที่ระบุในสัญญา • a + สัมประสิทธิ์รวมต้องเท่ากับ 1</p>',
    async function (bg) {
      var nk = { a: num(val(bg, 'fKa')), c: [], io: [], n: [] };
      for (var x = 0; x < 5; x++) { nk.n.push(val(bg, 'kn' + x)); nk.c.push(num(val(bg, 'kc' + x))); nk.io.push(num(val(bg, 'ki' + x))); }
      var use = val(bg, 'fKu') === '1', sum = nk.a + nk.c.reduce(function (a, b) { return a + b; }, 0);
      if (use && Math.abs(sum - 1) > 0.0001) throw new Error('ผลรวม a + สัมประสิทธิ์ = ' + sum.toFixed(2) + ' (ต้องเท่ากับ 1)');
      if (use && nk.c.some(function (c, i) { return c > 0 && !nk.io[i]; })) throw new Error('ดัชนีที่มีสัมประสิทธิ์ต้องมีค่าฐาน Io');
      S.P.fin = { adv: num(val(bg, 'fAdv')), ret: num(val(bg, 'fRet')), ldRate: num(val(bg, 'fLdr')), ldMin: num(val(bg, 'fLdm')), ldCap: num(val(bg, 'fCap')), kUse: use, kThr: num(val(bg, 'fKt')), k: nk };
      await saveProject(); toast('บันทึกเงื่อนไขสัญญาแล้ว'); render();
    }, null, true);
}
function docPay(id) {
  var i = S.installments.filter(function (x) { return x.id === id; })[0]; if (!i) return '<div class="card empty">ไม่พบงวดงาน</div>';
  var p = S.P, pay = payOf(i), F = fin(), row = function (a, b, strong) { return '<tr><td>' + a + '</td><td class="num">' + (strong ? '<b>' + b + '</b>' : b) + '</td></tr>'; };
  return '<div class="doc"><h1>ใบสรุปการคำนวณเงินค่างาน งวดที่ ' + esc(i.no) + '</h1><p style="text-align:center;margin-top:-4px">' + esc(p.org || '') + '</p>' + docHead() +
    '<table><tr><td style="width:24%">เนื้องานของงวด</td><td colspan="3">' + esc(i.scope) + '</td></tr><tr><td>กำหนดแล้วเสร็จ</td><td>' + th(i.due) + '</td><td style="width:18%">สถานะ</td><td>' + esc(instStatus(i).t) + '</td></tr>' +
    '<tr><td>วันที่ส่งมอบงาน</td><td>' + th(i.submitted) + '</td><td>วันที่ตรวจรับ</td><td>' + th(i.accepted) + '</td></tr></table>' +
    '<h3>การคำนวณ</h3><table>' + row('ค่างานตามสัญญา', money(i.amount)) + (num(i.vo_amount) ? row('งานเพิ่ม-ลดที่รวมในงวด', money(i.vo_amount)) : '') + row('มูลค่างานงวดนี้', money(pay.amt), true) +
    (pay.K != null ? row('ค่า K = ' + pay.K.toFixed(4) + ' (คิดเฉพาะส่วนที่เกิน ±' + F.kThr + '%)', money(pay.kadj)) : '') +
    row('หัก เงินล่วงหน้า ' + F.adv + '%', '(' + money(pay.adv) + ')') + row('หัก เงินประกันผลงาน ' + F.ret + '%', '(' + money(pay.ret) + ')') + (pay.ld ? row('หัก ค่าปรับ', '(' + money(pay.ld) + ')') : '') +
    row('ยอดจ่ายสุทธิ (ก่อนภาษี)', money(pay.net), true) + '</table>' + (i.remark ? '<h3>หมายเหตุ</h3><div class="box">' + esc(i.remark) + '</div>' : '') +
    '<p class="muted" style="font-size:16px">ยอดสุทธิยังไม่รวมภาษีมูลค่าเพิ่มและภาษีหัก ณ ที่จ่าย – ปรับตามเงื่อนไขสัญญาและระเบียบของหน่วยงาน</p>' +
    '<div class="sig"><div>ลงชื่อ ...........................<br>(...........................)<br>ผู้จัดทำ</div><div>ลงชื่อ ...........................<br>(' + esc(p.supervisor_name || '...........................') + ')<br>' + esc(p.supervisor_pos || 'ผู้ควบคุมงาน') + '</div>' +
    '<div>ลงชื่อ ...........................<br>(' + esc(p.chair || '...........................') + ')<br>ประธานกรรมการตรวจรับพัสดุ</div></div></div>';
}

/* ---------------- ฟอนต์ TH SarabunPSK ในไฟล์ Excel ---------------- */
var XL_FONT = 'TH SarabunPSK';
function scaleNum(v, k, min) { return String(Math.max(min || 0, Math.round(parseFloat(v) * k * 2) / 2)); }
async function applyThaiFont(zip, k, rowK) {
  var st = zip.file('xl/styles.xml');
  if (st) zip.file('xl/styles.xml', (await st.async('string')).replace(/<name val="[^"]*"\s*\/>/g, '<name val="' + XL_FONT + '"/>')
    .replace(/<sz val="([\d.]+)"\s*\/>/g, function (m, v) { return '<sz val="' + scaleNum(v, k, 12) + '"/>'; }).replace(/<family val="\d+"\s*\/>/g, ''));
  var ss = zip.file('xl/sharedStrings.xml');
  if (ss) zip.file('xl/sharedStrings.xml', (await ss.async('string')).replace(/<rFont val="[^"]*"\s*\/>/g, '<rFont val="' + XL_FONT + '"/>')
    .replace(/<sz val="([\d.]+)"\s*\/>/g, function (m, v) { return '<sz val="' + scaleNum(v, k, 12) + '"/>'; }));
  var names = Object.keys(zip.files);
  for (var i = 0; i < names.length; i++) {
    var n = names[i];
    if (/^xl\/charts\/chart\d+\.xml$/.test(n)) {
      zip.file(n, (await zip.file(n).async('string')).replace(/(<a:(?:latin|ea|cs) typeface=")[^"]*"/g, '$1' + XL_FONT + '"')
        .replace(/(<a:defRPr[^>]*?\ssz=")(\d+)"/g, function (m, a, v) { return a + Math.round(v * k / 100) * 100 + '"'; })
        .replace(/(<a:rPr[^>]*?\ssz=")(\d+)"/g, function (m, a, v) { return a + Math.round(v * k / 100) * 100 + '"'; }));
    } else if (rowK && /^xl\/worksheets\/sheet\d+\.xml$/.test(n)) {
      zip.file(n, (await zip.file(n).async('string')).replace(/(<row[^>]*?\sht=")([\d.]+)"/g, function (m, a, v) { return a + scaleNum(v, rowK) + '"'; }));
    }
  }
}
/* ---------------- ส่งออก Excel รูปแบบ v4 (เติมข้อมูลลงไฟล์แม่แบบ รักษาสูตร กราฟ และรูปแบบทั้งหมด) ---------------- */
var TPL_PATH = { single: 'templates/template_single.xlsx', multi: 'templates/template_multi.xlsx' };
var X_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main', R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
function loadJSZip() {
  if (window.JSZip) return Promise.resolve();
  var tryLoad = function (src) { return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); };
  return tryLoad('vendor/jszip.min.js').catch(function () { return tryLoad('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'); }).catch(function () { throw new Error('โหลดตัวสร้างไฟล์ Excel ไม่ได้'); });
}
async function tplBuffer(kind) {
  if (window.TPL_B64 && TPL_B64[kind]) { var bin = atob(TPL_B64[kind]), a = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a.buffer; }
  var r = await fetch(TPL_PATH[kind]); if (!r.ok) throw new Error('ไม่พบไฟล์แม่แบบ Excel (' + TPL_PATH[kind] + ')'); return r.arrayBuffer();
}
function colNum(L) { var n = 0; for (var i = 0; i < L.length; i++) n = n * 26 + L.charCodeAt(i) - 64; return n; }
function xlDate(dIso) { var d = D(dIso); return d ? (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1899, 11, 30)) / 86400000 : ''; }
function XSheet(xml, ss) {
  this.doc = new DOMParser().parseFromString(xml, 'application/xml'); this.ss = ss;
  this.sd = this.doc.getElementsByTagNameNS(X_NS, 'sheetData')[0]; this.rows = {}; this.cells = {};
  var self = this;
  Array.prototype.forEach.call(this.sd.getElementsByTagNameNS(X_NS, 'row'), function (r) {
    self.rows[r.getAttribute('r')] = r;
    Array.prototype.forEach.call(r.getElementsByTagNameNS(X_NS, 'c'), function (c) { self.cells[c.getAttribute('r')] = c; });
  });
}
XSheet.prototype.row = function (n) {
  if (this.rows[n]) return this.rows[n];
  var el = this.doc.createElementNS(X_NS, 'row'); el.setAttribute('r', String(n));
  var next = null; Array.prototype.some.call(this.sd.childNodes, function (x) { if (x.nodeType === 1 && +x.getAttribute('r') > n) { next = x; return true; } return false; });
  this.sd.insertBefore(el, next); this.rows[n] = el; return el;
};
XSheet.prototype.cell = function (ref) {
  if (this.cells[ref]) return this.cells[ref];
  var m = /^([A-Z]+)(\d+)$/.exec(ref), row = this.row(+m[2]), cn = colNum(m[1]);
  var el = this.doc.createElementNS(X_NS, 'c'); el.setAttribute('r', ref);
  var above = this.cells[m[1] + (+m[2] - 1)]; if (above && above.getAttribute('s')) el.setAttribute('s', above.getAttribute('s'));
  var next = null; Array.prototype.some.call(row.childNodes, function (x) { if (x.nodeType === 1 && colNum(/^[A-Z]+/.exec(x.getAttribute('r'))[0]) > cn) { next = x; return true; } return false; });
  row.insertBefore(el, next); this.cells[ref] = el; return el;
};
XSheet.prototype.set = function (ref, v) {
  var c = (v === '' || v == null) ? this.cells[ref] : this.cell(ref); if (!c) return;
  while (c.firstChild) c.removeChild(c.firstChild); c.removeAttribute('t');
  if (v === '' || v == null) return;
  if (typeof v === 'number') { if (!isFinite(v)) return; c.setAttribute('t', 'n'); var ve = this.doc.createElementNS(X_NS, 'v'); ve.textContent = String(v); c.appendChild(ve); return; }
  c.setAttribute('t', 'inlineStr'); var is = this.doc.createElementNS(X_NS, 'is'), t = this.doc.createElementNS(X_NS, 't');
  t.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve'); t.textContent = String(v); is.appendChild(t); c.appendChild(is);
};
XSheet.prototype.clearCols = function (cols, r1, r2) { for (var r = r1; r <= r2; r++) for (var i = 0; i < cols.length; i++) this.set(cols[i] + r, ''); };
XSheet.prototype.text = function (ref) {
  var c = this.cells[ref]; if (!c) return '';
  var t = c.getAttribute('t'), v = c.getElementsByTagNameNS(X_NS, 'v')[0];
  if (t === 's' && v) return this.ss[+v.textContent] || '';
  if (t === 'inlineStr') return c.textContent; return v ? v.textContent : '';
};
XSheet.prototype.stripCache = function () {
  Array.prototype.forEach.call(this.doc.getElementsByTagNameNS(X_NS, 'c'), function (c) {
    if (!c.getElementsByTagNameNS(X_NS, 'f').length) return;
    Array.prototype.slice.call(c.getElementsByTagNameNS(X_NS, 'v')).forEach(function (v) { c.removeChild(v); });
    c.removeAttribute('t');
  });
};
XSheet.prototype.xml = function () { return new XMLSerializer().serializeToString(this.doc); };

// รหัส WBS แบบเดียวกับสูตรในไฟล์ Excel (ใช้ผูกรายการใน VO/EOT/วัสดุ)
function tplCodes(multi) {
  var P = parts(), C = cats(), seq = {}, m = {};
  wbsList().forEach(function (o) { var t = o.t, pi = P.indexOf(t.part) + 1, ci = C.indexOf(t.cat) + 1, k = pi + '.' + ci; seq[k] = (seq[k] || 0) + 1;
    m[t.id] = multi ? pi + '.' + ci + '.' + (seq[k] < 10 ? '0' : '') + seq[k] : ci + '.' + seq[k]; });
  return m;
}
function tplPeriods(multi) {
  var st = projStart(), all = S.tasks, minOf = function (k) { return all.map(function (t) { return t[k]; }).filter(Boolean).sort()[0]; };
  var ax = [iso(st), minOf('bs'), minOf('rs'), minOf('as')].filter(Boolean).sort()[0];
  var snap = function (d) { var x = d.getDate(); return x <= 10 ? new Date(d.getFullYear(), d.getMonth(), 10) : x <= 20 ? new Date(d.getFullYear(), d.getMonth(), 20) : new Date(d.getFullYear(), d.getMonth() + 1, 0); };
  var out = [], s = D(ax);
  for (var i = 0; i < 80; i++) { var e = snap(s); out.push({ s: s, e: e }); s = addDays(e, 1); }
  return out;
}
async function exportV4() {
  await loadJSZip();
  var multi = isMulti() || parts().length > 1 || S.tasks.length > 60, kind = multi ? 'multi' : 'single';
  var cap = multi ? 150 : 60;
  if (S.tasks.length > cap) throw new Error('รายการงานเกิน ' + cap + ' รายการ ซึ่งเป็นความจุของแม่แบบ Excel');
  if (parts().length > 10 || cats().length > 10) throw new Error('แม่แบบ Excel รองรับงานส่วนและหมวดงานไม่เกินอย่างละ 10');
  var zip = await JSZip.loadAsync(await tplBuffer(kind));
  var wbXml = await zip.file('xl/workbook.xml').async('string'), relXml = await zip.file('xl/_rels/workbook.xml.rels').async('string');
  var wbDoc = new DOMParser().parseFromString(wbXml, 'application/xml'), relDoc = new DOMParser().parseFromString(relXml, 'application/xml');
  var target = {}; Array.prototype.forEach.call(relDoc.getElementsByTagName('Relationship'), function (r) { target[r.getAttribute('Id')] = 'xl/' + r.getAttribute('Target').replace(/^\/?xl\//, ''); });
  var paths = {}; Array.prototype.forEach.call(wbDoc.getElementsByTagNameNS(X_NS, 'sheet'), function (s) { paths[s.getAttribute('name')] = target[s.getAttributeNS(R_NS, 'id')]; });
  var ss = [], ssf = zip.file('xl/sharedStrings.xml');
  if (ssf) { var sd = new DOMParser().parseFromString(await ssf.async('string'), 'application/xml'); Array.prototype.forEach.call(sd.getElementsByTagNameNS(X_NS, 'si'), function (si) { ss.push(si.textContent); }); }
  var sheets = {};
  var sh = async function (name) { if (!sheets[name]) { if (!paths[name]) throw new Error('แม่แบบไม่มีชีต ' + name); sheets[name] = new XSheet(await zip.file(paths[name]).async('string'), ss); } return sheets[name]; };
  var p = S.P, F = fin(), d = today(), codes = tplCodes(multi), stamp = 'ส่งออกจากแอปคุมงานก่อสร้าง เมื่อ ' + th(d) + ' ' + new Date().toTimeString().slice(0, 5) + ' น.';
  var pctF = function (v) { return v === '' || v == null ? '' : num(v) / 100; }, n0 = function (v) { return v === '' || v == null ? '' : num(v); }, dt = function (v) { return v ? xlDate(v) : ''; };
  // ---- ตั้งค่า
  var su = await sh('ตั้งค่า Setup');
  su.set('B2', 'กรอกเฉพาะช่องสีเหลือง • ' + stamp);
  [['C4', p.name], ['C5', ''], ['C6', p.employer], ['C7', p.contractor], ['C8', p.contract_no], ['C9', n0(p.bac)], ['C10', dt(p.start)], ['C11', n0(p.duration)],
    ['C15', xlDate(iso(d))], ['C17', F.ldRate / 100], ['C18', F.ldMin], ['C19', F.ldCap / 100], ['C22', p.supervisor_name || '']].forEach(function (x) { su.set(x[0], x[1]); });
  for (var r = 4; r <= 22; r++) if (/ตัวอย่าง|จากเอกสาร|อ่านจาก|EXAMPLE/.test(su.text('D' + r))) su.set('D' + r, '');
  if (multi) { su.clearCols(['C'], 26, 35); su.clearCols(['C'], 38, 47); parts().forEach(function (x, i) { su.set('C' + (26 + i), x); }); cats().forEach(function (x, i) { su.set('C' + (38 + i), x); }); }
  else { su.clearCols(['C'], 26, 35); cats().forEach(function (x, i) { su.set('C' + (26 + i), x); }); }
  // ---- แผนงาน
  var sc = await sh('แผนงาน Schedule'), RN = multi ? 156 : 66;
  var M = multi ? { part: 'B', cat: 'C', desc: 'D', boq: 'E', w: 'F', bs: 'I', bf: 'J', rs: 'L', rf: 'M', as: 'N', af: 'O', pct: 'P', rm: 'Z' }
    : { cat: 'B', desc: 'C', boq: 'D', w: 'E', bs: 'H', bf: 'I', rs: 'K', rf: 'L', as: 'M', af: 'N', pct: 'O', rm: 'Y' };
  sc.clearCols(Object.keys(M).map(function (k) { return M[k]; }), 7, RN);
  wbsList().forEach(function (o, i) { var t = o.t, r = 7 + i;
    if (multi) sc.set(M.part + r, t.part); sc.set(M.cat + r, t.cat); sc.set(M.desc + r, t.desc); sc.set(M.boq + r, n0(t.boq)); sc.set(M.w + r, pctF(t.weight));
    ['bs', 'bf', 'rs', 'rf', 'as', 'af'].forEach(function (k) { sc.set(M[k] + r, dt(t[k])); });
    sc.set(M.pct + r, num(t.pct) / 100); sc.set(M.rm + r, t.remark || ''); });
  // ---- S-Curve (ค่าสะสมจริงรายงวดจากประวัติผลงาน + เงินเบิกจ่าย)
  var cv = await sh('S-Curve'), hist = histIndex(), per = tplPeriods(multi);
  cv.clearCols(['F', 'K', 'M'], 7, 86);
  per.forEach(function (x, i) {
    if (x.s > d) return; var r = 7 + i;
    cv.set('F' + r, actualAt(x.e <= d ? x.e : d, hist));
    var paid = S.installments.filter(function (it) { return it.accepted && it.accepted >= iso(x.s) && it.accepted <= iso(x.e); }).reduce(function (a, it) { return a + payOf(it).net; }, 0);
    if (paid) cv.set('M' + r, paid);
  });
  // ---- ขยายเวลา
  var eo = await sh('ขยายเวลา EOT'), CAUSE = { 'ผู้ว่าจ้าง': 'ผู้ว่าจ้าง / Employer', 'ผู้รับจ้าง': 'ผู้รับจ้าง / Contractor', 'เหตุสุดวิสัย': 'เหตุสุดวิสัย / Force Majeure', 'อื่นๆ': 'อื่นๆ / Other' };
  var EST = { 'รอพิจารณา': 'รอพิจารณา / Pending', 'อนุมัติ': 'อนุมัติ / Approved', 'อนุมัติบางส่วน': 'อนุมัติบางส่วน / Partial', 'ไม่อนุมัติ': 'ไม่อนุมัติ / Rejected' };
  eo.clearCols(['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'L'], 8, 57);
  var eList = S.eots.slice().sort(function (a, b) { return (a.date || '') < (b.date || '') ? -1 : 1; });
  if (num(p.eot_days)) eList.push({ date: '', desc: 'ขยายเวลาอื่น (นอกทะเบียน)', cause: 'อื่นๆ', days_claimed: p.eot_days, status: 'อนุมัติ', days_approved: p.eot_days });
  eList.slice(0, 50).forEach(function (e, i) { var r = 8 + i;
    eo.set('B' + r, dt(e.date)); eo.set('C' + r, e.desc); eo.set('D' + r, codes[e.taskId] || ''); eo.set('E' + r, CAUSE[e.cause] || ''); eo.set('F' + r, n0(e.days_claimed));
    eo.set('G' + r, e.letter_ref || ''); eo.set('H' + r, dt(e.submitted)); eo.set('I' + r, EST[e.status] || ''); eo.set('J' + r, n0(e.days_approved)); eo.set('L' + r, e.remark || ''); });
  // ---- บันทึกสัปดาห์
  var wl = await sh('บันทึกสัปดาห์ Weekly Log');
  [['C4', p.org], ['C5', p.doc_prefix], ['C6', dt(p.contract_date)], ['C7', p.supervisor_name], ['C8', p.supervisor_pos || 'ผู้ควบคุมงาน'], ['C9', p.chair], ['C10', p.member1], ['C11', p.member2]].forEach(function (x) { wl.set(x[0], x[1] || ''); });
  wl.clearCols(['E', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O'], 17, 120);
  for (var n = 1; n <= Math.min(104, weekOf(d)); n++) {
    var st = weekStats(n), w = weekRec(n) || {}, r = 16 + n;
    if (st.r.start > d) break;
    wl.set('E' + r, st.act);
    if (st.days.length) { wl.set('H' + r, Math.round(st.menAvg * 10) / 10); wl.set('I' + r, Object.keys(st.mach).map(function (k) { return k + ' ' + st.mach[k]; }).join(', ')); wl.set('J' + r, st.work + ' / ' + (st.days.length - st.work)); }
    var wd = w.work_done != null ? w.work_done : compileText(st, 'work'); if (wd) wl.set('K' + r, wd);
    if (w.next_plan) wl.set('L' + r, w.next_plan);
    var mt = w.materials != null ? w.materials : compileText(st, 'materials'); if (mt) wl.set('M' + r, mt);
    var is = w.issues != null ? w.issues : compileText(st, 'issues'); if (is) wl.set('N' + r, is);
    if (w.opinion) wl.set('O' + r, w.opinion);
  }
  // ---- งวดงาน + เงินงวด
  var ins = await sh('งวดงาน Installments'), pay = await sh('เงินงวด Payment'), list = sortedInst().slice(0, 20);
  ins.set('A3', stamp);
  ins.clearCols(['A', 'B', 'C', 'D', 'E', 'G', 'H', 'M'], 7, 26); pay.clearCols(['D', 'F', 'G', 'H', 'I', 'J', 'O'], 15, 34);
  list.forEach(function (i, k) { var r = 7 + k, q = 15 + k;
    ins.set('A' + r, /^\d+$/.test(String(i.no)) ? +i.no : i.no); ins.set('B' + r, i.scope); ins.set('C' + r, pctF(i.req_pct)); ins.set('D' + r, dt(i.due)); ins.set('E' + r, n0(i.amount));
    ins.set('G' + r, dt(i.submitted)); ins.set('H' + r, dt(i.accepted)); ins.set('M' + r, i.remark || '');
    pay.set('D' + q, n0(i.vo_amount)); (i.it || []).forEach(function (v, j) { if (v != null && v !== '') pay.set(String.fromCharCode(70 + j) + q, num(v)); }); pay.set('O' + q, n0(i.ld)); });
  pay.set('D5', F.adv / 100); pay.set('D7', F.ret / 100); pay.set('D8', F.kThr / 100); pay.set('D9', F.kUse ? 'ใช้' : 'ไม่ใช้'); pay.set('H4', num(F.k.a));
  for (var j = 0; j < 5; j++) { pay.set('H' + (5 + j), num(F.k.c[j])); pay.set('I' + (5 + j), num(F.k.io[j]) || ''); pay.set('J' + (5 + j), F.k.n[j] || ''); }
  // ---- งานเพิ่มลด
  var vo = await sh('งานเพิ่มลด VO');
  vo.clearCols(['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'M'], 10, 59);
  S.vos.slice().sort(function (a, b) { return (a.date || '') < (b.date || '') ? -1 : 1; }).slice(0, 50).forEach(function (v, i) { var r = 10 + i;
    vo.set('B' + r, v.doc_no || ''); vo.set('C' + r, dt(v.date)); vo.set('D' + r, v.desc); vo.set('E' + r, codes[v.taskId] || ''); vo.set('F' + r, v.type); vo.set('G' + r, n0(v.amount));
    vo.set('H' + r, v.status); vo.set('I' + r, v.status === 'อนุมัติ' ? n0(v.approved_amount !== '' && v.approved_amount != null ? v.approved_amount : v.amount) : ''); vo.set('J' + r, dt(v.approved_date)); vo.set('K' + r, n0(v.days)); vo.set('M' + r, v.remark || ''); });
  // ---- ขออนุมัติวัสดุ
  var sb = await sh('ขออนุมัติวัสดุ Submittal'), AIR = { approved: 'ผ่าน', more_docs: 'ขอเอกสารเพิ่มเติม', rejected: 'ไม่ผ่าน' };
  sb.clearCols(['B', 'C', 'D', 'E', 'F', 'H', 'J', 'K', 'L', 'M', 'O'], 9, 108);
  S.submittals.slice().sort(function (a, b) { return (a.doc_no || '').localeCompare(b.doc_no || '', 'th'); }).slice(0, 100).forEach(function (s, i) { var r = 9 + i, cs = checkSummary(s);
    sb.set('B' + r, s.doc_no); sb.set('C' + r, s.spec_sec ? specName(s.spec_sec) : 'ข้อกำหนดเฉพาะ'); sb.set('D' + r, s.material); sb.set('E' + r, s.brand || ''); sb.set('F' + r, codes[s.taskId] || '');
    sb.set('H' + r, n0(s.lead_days)); sb.set('J' + r, dt(s.submitted_date)); sb.set('K' + r, s.status); sb.set('L' + r, dt(s.approved_date));
    sb.set('M' + r, s.ai ? AIR[s.ai.overall] : 'ยังไม่ตรวจ'); sb.set('O' + r, [s.remark, cs.n ? 'ตรวจแล้ว ' + cs.done + '/' + cs.n + ' ข้อ' : ''].filter(Boolean).join(' • ')); });
  // ---- คู่มือ: แทนข้อความ "ข้อมูลตัวอย่าง"
  var gu = await sh('คู่มือ Guide');
  Object.keys(gu.cells).forEach(function (ref) { if (/ข้อมูลตัวอย่าง|EXAMPLE/.test(gu.text(ref))) gu.set(ref, '⚠ ' + stamp + ' – ข้อมูลเป็นของโครงการ ' + p.name); });
  // ---- ล้างค่าสูตรเดิม (ให้ Excel คำนวณใหม่เมื่อเปิด) และลบความคิดเห็นตัวอย่าง
  var ct = await zip.file('[Content_Types].xml').async('string');
  for (var name in paths) {
    var path = paths[name], s = sheets[name] || new XSheet(await zip.file(path).async('string'), ss);
    s.stripCache();
    var relPath = path.replace(/worksheets\/([^\/]+)$/, 'worksheets/_rels/$1.rels'), rf = zip.file(relPath);
    if (rf) {
      var rd = new DOMParser().parseFromString(await rf.async('string'), 'application/xml'), drop = [];
      Array.prototype.forEach.call(rd.getElementsByTagName('Relationship'), function (rel) { if (/\/(comments|vmlDrawing)$/.test(rel.getAttribute('Type'))) drop.push(rel); });
      drop.forEach(function (rel) {
        var tp = 'xl/' + rel.getAttribute('Target').replace(/^\.\.\//, ''); zip.remove(tp);
        ct = ct.replace(new RegExp('<Override[^>]*PartName="/' + tp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"[^>]*/>'), '');
        rel.parentNode.removeChild(rel);
      });
      if (drop.length) { Array.prototype.slice.call(s.doc.getElementsByTagNameNS(X_NS, 'legacyDrawing')).forEach(function (x) { x.parentNode.removeChild(x); }); zip.file(relPath, new XMLSerializer().serializeToString(rd)); }
    }
    zip.file(path, s.xml());
  }
  zip.file('[Content_Types].xml', ct);
  var calc = wbDoc.getElementsByTagNameNS(X_NS, 'calcPr')[0];
  if (!calc) { calc = wbDoc.createElementNS(X_NS, 'calcPr'); wbDoc.documentElement.appendChild(calc); }
  calc.setAttribute('fullCalcOnLoad', '1'); zip.file('xl/workbook.xml', new XMLSerializer().serializeToString(wbDoc));
  if (zip.file('xl/calcChain.xml')) zip.remove('xl/calcChain.xml');
  await applyThaiFont(zip, 1.4, 1.25);
  var blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', compression: 'DEFLATE' });
  var fname = 'ควบคุมงาน_' + p.name.replace(/[\\\/:*?"<>|()]/g, '_').slice(0, 50) + '_' + iso(d) + '.xlsx';
  if (await saveBlob(fname, blob)) toast('ส่งออกไฟล์ Excel (รูปแบบ v4 ' + (multi ? 'หลายงานส่วน' : 'งานเดียว') + ') แล้ว', false, 4000);
}

/* ---------------- AI ตรวจสเปก (Claude API เรียกจากเครื่องโดยตรง) ---------------- */
var AI_DEFAULT_MODEL = 'claude-sonnet-5';
var AI_URL = 'https://api.anthropic.com/v1';
var GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta';
async function aiCfg() { return Object.assign({ provider: 'gemini', key: '', model: AI_DEFAULT_MODEL, gkey: '', gmodel: '', limit: 30, used: {} }, (await meta('ai')) || {}); }
function aiReady(c) { return c.provider === 'claude' ? !!c.key : !!c.gkey; }
function aiName(c) { return c.provider === 'claude' ? 'Claude (' + (c.model || AI_DEFAULT_MODEL) + ')' : 'Gemini (' + (c.gmodel || 'เลือกอัตโนมัติ') + ')'; }
function aiSandboxed() { return /claudeusercontent|claude\.ai|claude\.site/.test(location.host) || location.protocol === 'file:'; }
function aiHeaders(key) { return { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true', 'content-type': 'application/json' }; }
// เลือกรุ่น Gemini: รุ่น Flash ใหม่ที่สุดที่เป็นรุ่นเสถียร (ไม่ใช่ lite/preview/exp) ถ้าไม่มีจึงใช้รุ่นอื่น
function pickGemini(ids) {
  var ver = function (id) { var m = /gemini-(\d+(?:\.\d+)?)/.exec(id); return m ? parseFloat(m[1]) : 0; };
  var score = function (id) { return ver(id) * 100 - (/lite/.test(id) ? 30 : 0) - (/preview|exp/.test(id) ? 10 : 0) - (/-\d{3,}$|latest/.test(id) ? 1 : 0); };
  var c = ids.filter(function (id) { return /^gemini-[\d.]+-flash/.test(id) && !/image|tts|audio|live|thinking|embedding/.test(id); });
  return c.sort(function (a, b) { return score(b) - score(a); })[0] || ids.filter(function (id) { return /flash/.test(id); })[0] || '';
}
async function geminiModels(key) {
  var r = await fetch(GEMINI_URL + '/models?pageSize=200&key=' + encodeURIComponent(key)).catch(function () { throw new Error('เชื่อมต่อ Gemini ไม่ได้ – ตรวจอินเทอร์เน็ต'); });
  if (r.status === 400 || r.status === 403) throw new Error('API key ของ Gemini ไม่ถูกต้อง');
  if (!r.ok) throw new Error('เชื่อมต่อ Gemini ไม่ได้ (' + r.status + ')');
  return ((await r.json()).models || []).filter(function (m) { return (m.supportedGenerationMethods || []).indexOf('generateContent') >= 0; })
    .map(function (m) { return String(m.name).replace(/^models\//, ''); });
}
async function aiTest(c) {
  if (c.provider !== 'claude') {
    var ids = await geminiModels(c.gkey), m = c.gmodel && ids.indexOf(c.gmodel) >= 0 ? c.gmodel : pickGemini(ids);
    if (!m) throw new Error('คีย์ใช้ได้ แต่ไม่พบโมเดล Gemini Flash ในบัญชีนี้');
    c.gmodel = m; await meta('ai', c); return 'เชื่อมต่อ Gemini สำเร็จ • ใช้โมเดล ' + m;
  }
  var r = await fetch(AI_URL + '/models?limit=1000', { headers: aiHeaders(c.key) }).catch(function () { throw new Error('เชื่อมต่อไม่ได้ – ตรวจอินเทอร์เน็ต'); });
  if (r.status === 401) throw new Error('API key ไม่ถูกต้องหรือถูกยกเลิก');
  if (!r.ok) throw new Error('เชื่อมต่อไม่ได้ (' + r.status + ')');
  var ids2 = ((await r.json()).data || []).map(function (x) { return x.id; });
  if (ids2.length && ids2.indexOf(c.model) < 0) throw new Error('คีย์ใช้ได้ แต่ไม่พบโมเดล ' + c.model + ' – ใช้ได้: ' + ids2.slice(0, 5).join(', '));
  return 'เชื่อมต่อ Claude สำเร็จ • โมเดล ' + c.model;
}
var AI_SYSTEM = [
  'คุณคือผู้ตรวจสอบวัสดุก่อสร้างของผู้ควบคุมงานในโครงการภาครัฐของไทย',
  'หน้าที่: เทียบเอกสารสเปก/แคตตาล็อก/ใบรับรอง/ภาพถ่ายวัสดุที่ผู้รับจ้างเสนอ กับ "ข้อกำหนด" ที่ให้มาทีละข้อ',
  'กฎที่ต้องปฏิบัติอย่างเคร่งครัด:',
  '1. ใช้เฉพาะสิ่งที่เห็นจริงในไฟล์ที่แนบ ห้ามเดา ห้ามใช้ความรู้ทั่วไปแทนหลักฐาน',
  '2. ถ้าไม่พบหลักฐานของข้อใด ให้ตัดสิน "ไม่พบข้อมูล" และระบุว่าต้องขอเอกสารอะไรเพิ่ม',
  '3. ตัดสิน "ไม่ผ่าน" เฉพาะเมื่อพบหลักฐานที่ขัดกับข้อกำหนดชัดเจน',
  '4. ถ้าข้อกำหนดไม่เกี่ยวกับวัสดุที่เสนอ (เช่น วัสดุคนละชนิดในหมวดเดียวกัน หรือขั้นตอนทำงานหน้างาน) ให้ตัดสิน "ไม่เกี่ยวข้อง"',
  '5. ช่อง found ให้สั้น ไม่เกิน 30 คำ ระบุสิ่งที่พบและตำแหน่ง เช่น "ไฟล์ 2 หน้า 1: มอก. 24-2559 SD40"',
  '6. ตอบเป็น JSON เท่านั้น ไม่มีข้อความอื่น ไม่มี ``` ครอบ'
].join('\n');
function parseAiJson(text) {
  var t = String(text || '').replace(/```json|```/g, '').trim(), a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('AI ตอบกลับในรูปแบบที่อ่านไม่ได้ กรุณาลองใหม่');
  try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { throw new Error('AI ตอบกลับในรูปแบบที่อ่านไม่ได้ กรุณาลองใหม่'); }
}
async function aiCheck(s) {
  var cfg = await aiCfg(), day = iso(today()), used = num(cfg.used[day]), gem = cfg.provider !== 'claude';
  if (aiSandboxed()) throw new Error('AI ใช้ได้เมื่อเปิดแอปจาก GitHub Pages (หน้าทดลองใน claude.ai ไม่อนุญาตให้เชื่อมต่อภายนอก)');
  if (!aiReady(cfg)) throw new Error('ยังไม่ได้ใส่ API key – ไปที่ ตั้งค่าแอป → AI ตรวจสเปก');
  if (used >= num(cfg.limit)) throw new Error('ใช้ AI ครบจำนวนที่ตั้งไว้ของวันนี้แล้ว (' + cfg.limit + ' ครั้ง) – ปรับได้ที่ตั้งค่าแอป');
  var crit = criteriaOf(s).slice(0, 60);
  if (!crit.length) throw new Error('กำหนดเกณฑ์ตรวจก่อน (เลือกหมวดหรือพิมพ์ข้อกำหนด)');
  var files = filesOf('submittal', s.id).slice(0, 8);
  if (!files.length) throw new Error('แนบเอกสารสเปกหรือรูปวัสดุก่อน');
  for (var q = 0; q < files.length; q++) if (!files[q].blob && typeof ensureBlob === 'function') await ensureBlob(files[q]);
  var total = files.reduce(function (a, f) { return a + (f.size || (f.blob ? f.blob.size : 0)); }, 0), cap = gem ? 15 : 24;
  if (total > cap * 1024 * 1024) throw new Error('ไฟล์แนบรวมใหญ่เกิน ' + cap + ' MB – ลดจำนวนไฟล์หรือแยกเฉพาะหน้าที่เกี่ยวข้อง');
  var intro = [], datas = [];
  for (var i = 0; i < files.length; i++) { intro.push('ไฟล์ ' + (i + 1) + ': ' + files[i].name + (files[i].caption ? ' (' + files[i].caption + ')' : '')); datas.push({ mime: files[i].mime, data: await b64FromBlob(files[i].blob) }); }
  var ask = ['วัสดุที่เสนอ: ' + (s.material || '-') + ' | ยี่ห้อ/รุ่น: ' + (s.brand || '-') + ' | หมวด: ' + (s.spec_sec ? specName(s.spec_sec) : 'ข้อกำหนดเฉพาะ'),
    'ข้อกำหนดที่ต้องตรวจ (JSON): ' + JSON.stringify(crit.map(function (c) { return { cl: c.cl, mat: c.mat, kind: c.kind, req: c.req }; })),
    'ตอบเป็น JSON รูปแบบ: {"items":[{"cl":"ข้อ","mat":"วัสดุ","found":"สิ่งที่พบ","verdict":"ผ่าน|ไม่ผ่าน|ไม่พบข้อมูล|ไม่เกี่ยวข้อง"}],"summary":"สรุป 2-4 ประโยค ระบุเอกสารที่ต้องขอเพิ่ม (ถ้ามี)"} โดยมี items ครบทุกข้อตามลำดับ'].join('\n');
  if (gem && !cfg.gmodel) { try { await aiTest(cfg); } catch (e) { throw e; } }
  cfg.used = {}; cfg.used[day] = used + 1; await meta('ai', cfg);
  var ctl = new AbortController(), timer = setTimeout(function () { ctl.abort(); }, 180000), res, url, body, headers, model = gem ? cfg.gmodel : (cfg.model || AI_DEFAULT_MODEL);
  if (gem) {
    var parts = []; datas.forEach(function (d, i) { parts.push({ text: intro[i] }); parts.push({ inline_data: { mime_type: d.mime, data: d.data } }); }); parts.push({ text: ask });
    url = GEMINI_URL + '/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(cfg.gkey); headers = { 'content-type': 'application/json' };
    body = { systemInstruction: { parts: [{ text: AI_SYSTEM }] }, contents: [{ role: 'user', parts: parts }], generationConfig: { temperature: 0.1, responseMimeType: 'application/json', maxOutputTokens: 8192 } };
  } else {
    var content = []; datas.forEach(function (d, i) { var src = { type: 'base64', media_type: d.mime, data: d.data }; content.push({ type: 'text', text: intro[i] }); content.push(d.mime === 'application/pdf' ? { type: 'document', source: src } : { type: 'image', source: src }); });
    content.push({ type: 'text', text: ask });
    url = AI_URL + '/messages'; headers = aiHeaders(cfg.key); body = { model: model, max_tokens: 4000, system: AI_SYSTEM, messages: [{ role: 'user', content: content }] };
  }
  try { res = await fetch(url, { method: 'POST', headers: headers, signal: ctl.signal, body: JSON.stringify(body) }); }
  catch (e) { throw new Error(e.name === 'AbortError' ? 'AI ใช้เวลานานเกินไป ลองลดจำนวนไฟล์แล้วตรวจใหม่' : 'เชื่อมต่อ AI ไม่ได้ – ตรวจอินเทอร์เน็ต'); } finally { clearTimeout(timer); }
  var txt = await res.text();
  if (!res.ok) {
    var msg = txt; try { var ej = JSON.parse(txt); msg = (ej.error && ej.error.message) || msg; } catch (e) {}
    if (res.status === 429) throw new Error(gem ? 'เกินโควตาฟรีของ Gemini (จำกัดต่อนาที/ต่อวัน) – รอสักครู่แล้วลองใหม่ หรือลองพรุ่งนี้' : 'AI ไม่ว่างหรือเกินโควตา (429) – ลองใหม่ภายหลัง');
    throw new Error('AI ตอบกลับผิดพลาด (' + res.status + '): ' + String(msg).slice(0, 160));
  }
  var data = JSON.parse(txt), text, usage = null;
  if (gem) {
    var cand = (data.candidates || [])[0];
    if (!cand) throw new Error('Gemini ปฏิเสธการตรวจ' + (data.promptFeedback && data.promptFeedback.blockReason ? ' (' + data.promptFeedback.blockReason + ')' : '') + ' – ลองใหม่หรือเปลี่ยนไฟล์');
    text = ((cand.content || {}).parts || []).map(function (p) { return p.text || ''; }).join('');
    if (!text && cand.finishReason) throw new Error('Gemini ไม่ส่งผลตรวจ (' + cand.finishReason + ') – ลองลดจำนวนไฟล์แล้วตรวจใหม่');
    usage = data.usageMetadata || null;
  } else { text = (data.content || []).filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join(''); usage = data.usage || null; }
  var out = parseAiJson(text);
  var V = ['ผ่าน', 'ไม่ผ่าน', 'ไม่พบข้อมูล', 'ไม่เกี่ยวข้อง'];
  var items = crit.map(function (c, i) {
    var m = (out.items || []).filter(function (x) { return String(x.cl) === String(c.cl) && (!x.mat || x.mat === c.mat); })[0] || (out.items || [])[i] || {};
    return { key: c.key, cl: c.cl, mat: c.mat, req: c.req, found: String(m.found || 'AI ไม่ได้ตอบข้อนี้').slice(0, 300), verdict: V.indexOf(m.verdict) >= 0 ? m.verdict : 'ไม่พบข้อมูล' };
  });
  var rel = items.filter(function (x) { return x.verdict !== 'ไม่เกี่ยวข้อง'; });
  var overall = !rel.length ? 'more_docs' : rel.some(function (x) { return x.verdict === 'ไม่ผ่าน'; }) ? 'rejected' : rel.some(function (x) { return x.verdict === 'ไม่พบข้อมูล'; }) ? 'more_docs' : 'approved';
  s.ai = { items: items, summary: String(out.summary || '').slice(0, 1500), overall: overall, model: (gem ? 'Gemini ' : 'Claude ') + model, at: new Date().toISOString(), files: files.length, usage: usage };
  s.updated = new Date().toISOString(); await DB.put('submittals', s);
  return s;
}
var AI_OVR = { approved: { k: 'ok', t: 'AI แนะนำ: อนุมัติได้' }, more_docs: { k: 'warn', t: 'AI แนะนำ: ขอเอกสารเพิ่มเติม' }, rejected: { k: 'bad', t: 'AI แนะนำ: ไม่อนุมัติ' } };
function aiCard(s, cfg) {
  var ai = s.ai, nF = filesOf('submittal', s.id).length, nC = criteriaOf(s).length, ready = aiReady(cfg) && !aiSandboxed();
  var h = '<div class="card"><div class="card-h"><h2>ตรวจเบื้องต้นด้วย AI</h2>' + (ready ? '<button class="btn acc" data-act="aiRun" ' + (nF && nC ? '' : 'disabled') + '>' + ic('spark') + (ai ? 'ตรวจใหม่' : 'ตรวจด้วย AI') + '</button>' : '') + '</div>';
  if (aiSandboxed()) h += '<p class="muted">AI ใช้ได้เมื่อเปิดแอปจาก GitHub Pages ที่ติดตั้งแล้ว (หน้าทดลองใน claude.ai ไม่อนุญาตให้เชื่อมต่อภายนอก)</p>';
  else if (!aiReady(cfg)) h += '<p class="muted">ยังไม่ได้เปิดใช้ – ใส่ API key ของ Gemini (ฟรี) หรือ Claude ที่ <a href="#/app">ตั้งค่าแอป</a></p>';
  else if (!nF || !nC) h += '<p class="muted">ต้องมีไฟล์แนบและเกณฑ์ที่ใช้ตรวจก่อน</p>';
  else h += '<p class="muted">ส่งไฟล์แนบ ' + nF + ' ไฟล์ให้ ' + esc(aiName(cfg)) + ' เทียบกับข้อกำหนด ' + Math.min(nC, 60) + ' ข้อ • ใช้เวลาประมาณ 20–60 วินาที' + (cfg.provider === 'claude' ? ' • มีค่าใช้จ่าย API ต่อครั้ง' : ' • ฟรี (มีจำนวนครั้งจำกัด)') + '</p>';
  if (ai) {
    var cnt = function (v) { return ai.items.filter(function (x) { return x.verdict === v; }).length; };
    h += '<div class="row" style="margin:6px 0">' + badge(AI_OVR[ai.overall] || { k: 'na', t: ai.overall }) + '<span class="muted">ผ่าน ' + cnt('ผ่าน') + ' • ไม่ผ่าน ' + cnt('ไม่ผ่าน') + ' • ไม่พบข้อมูล ' + cnt('ไม่พบข้อมูล') + ' • ไม่เกี่ยวข้อง ' + cnt('ไม่เกี่ยวข้อง') + '</span>' +
      '<button class="btn sm sec" data-act="aiApply">นำผล AI ไปใส่ในช่องที่ยังไม่ตรวจ</button></div><p><b>สรุป:</b> ' + esc(ai.summary || '-') + '</p>' +
      '<div class="tw"><table class="tbl"><thead><tr><th>ข้อ</th><th>ข้อกำหนด</th><th>สิ่งที่พบ</th><th>ผล</th></tr></thead><tbody>' + ai.items.map(function (x) {
        return '<tr><td>' + esc(x.cl) + '</td><td>' + esc(x.req) + '</td><td>' + esc(x.found) + '</td><td class="v-' + esc(x.verdict) + ' nowrap">' + esc(x.verdict) + '</td></tr>'; }).join('') + '</tbody></table></div>' +
      '<p class="muted">ตรวจเมื่อ ' + th(ai.at.slice(0, 10), true) + ' ' + ai.at.slice(11, 16) + ' • ' + esc(ai.model) + ' • ผลจาก AI เป็นการคัดกรองเบื้องต้น ผู้ควบคุมงานต้องตรวจเอกสารจริงก่อนอนุมัติ</p>';
  }
  return h + '</div>';
}

/* ---------------- ซิงก์ข้อมูลระหว่างเครื่อง (ผ่าน Google Apps Script ของผู้ใช้) ---------------- */
var SYNC_STORES = ['projects', 'tasks', 'progress', 'daily', 'weekly', 'submittals', 'files', 'installments', 'vos', 'eots'];
var SYNC = { running: false, timer: null, state: 'off', msg: '', pending: 0, last: null, silent: 0 };
// ---- บันทึกทุกการเปลี่ยนแปลงลงคิว (outbox) ----
var _raw = { put: DB.put, putMany: DB.putMany, del: DB.del, delMany: DB.delMany };
function syncable(s) { return SYNC_STORES.indexOf(s) >= 0 && !SYNC.silent; }
function nowIso() { return new Date().toISOString(); }
function outboxPut(entries) { if (!entries.length) return Promise.resolve(); return tx('outbox', 'readwrite', function (os) { entries.forEach(function (e) { os.put(e); }); }).then(function () { SYNC.pending += entries.length; syncBadge(); scheduleSync(6000); }); }
DB.put = function (s, o) {
  if (!syncable(s)) return _raw.put(s, o);
  o._ts = nowIso(); return _raw.put(s, o).then(function (r) { return outboxPut([{ k: s + '|' + o.id, store: s, id: o.id, op: 'put', t: o._ts }]).then(function () { return r; }); });
};
DB.putMany = function (s, arr) {
  if (!syncable(s)) return _raw.putMany(s, arr);
  var t = nowIso(); arr.forEach(function (o) { o._ts = t; });
  return _raw.putMany(s, arr).then(function (r) { return outboxPut(arr.map(function (o) { return { k: s + '|' + o.id, store: s, id: o.id, op: 'put', t: t }; })).then(function () { return r; }); });
};
DB.del = function (s, id) {
  if (!syncable(s)) return _raw.del(s, id);
  var t = nowIso(); return _raw.del(s, id).then(function (r) { return outboxPut([{ k: s + '|' + id, store: s, id: id, op: 'del', t: t }]).then(function () { return r; }); });
};
DB.delMany = function (s, ids) {
  if (!syncable(s)) return _raw.delMany(s, ids);
  var t = nowIso(); return _raw.delMany(s, ids).then(function (r) { return outboxPut(ids.map(function (id) { return { k: s + '|' + id, store: s, id: id, op: 'del', t: t }; })).then(function () { return r; }); });
};
async function silently(fn) { SYNC.silent++; try { return await fn(); } finally { SYNC.silent--; } }
function outboxAll() { return tx('outbox', 'readonly', function (os) { return os.getAll(); }); }
function outboxGet(k) { return tx('outbox', 'readonly', function (os) { return os.get(k); }); }
function outboxDel(keys) { return tx('outbox', 'readwrite', function (os) { keys.forEach(function (k) { os.delete(k); }); }); }
async function syncCfg() { return (await meta('sync')) || null; }
async function syncResetLocal() { await tx('outbox', 'readwrite', function (os) { return os.clear(); }); var c = await syncCfg(); if (c) { c.cursor = 0; await meta('sync', c); } SYNC.pending = 0; syncBadge(); }
// ---- เรียกตัวกลาง (ใช้ text/plain เพื่อไม่ให้เกิด CORS preflight ซึ่ง Apps Script ไม่รองรับ) ----
async function syncCall(c, action, payload) {
  var res;
  try { res = await fetch(c.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ action: action, key: c.key }, payload || {})), redirect: 'follow' }); }
  catch (e) { throw new Error('เชื่อมต่อเครื่องซิงก์ไม่ได้ – ตรวจอินเทอร์เน็ตและลิงก์'); }
  var t = await res.text(), j; try { j = JSON.parse(t); } catch (e) { throw new Error('ลิงก์ซิงก์ไม่ถูกต้อง (ไม่ใช่ลิงก์ Web app ที่ลงท้ายด้วย /exec หรือยังไม่ได้ตั้ง Who has access: Anyone)'); }
  if (!j.ok) throw new Error({ KEY: 'รหัสซิงก์ไม่ถูกต้อง', SETUP: 'ยังไม่ได้รันฟังก์ชัน setup ใน Apps Script', ACTION: 'โค้ดซิงก์ใน Apps Script เป็นเวอร์ชันเก่า' }[j.error] || ('ซิงก์ผิดพลาด: ' + j.error));
  return j.data;
}
// ---- ไฟล์: อัปโหลดเมื่อส่ง • ดาวน์โหลดเมื่อจะใช้ ----
var _blobJobs = {};
function ensureBlob(f) {
  if (f.blob) return Promise.resolve(f.blob);
  if (!f.driveId) return Promise.reject(new Error('ไม่พบไฟล์ในเครื่องนี้'));
  if (_blobJobs[f.id]) return _blobJobs[f.id];
  _blobJobs[f.id] = syncCfg().then(function (c) { if (!c) throw new Error('ไฟล์อยู่บนคลาวด์ – เปิดการซิงก์เพื่อโหลด'); return syncCall(c, 'getFile', { driveId: f.driveId }); })
    .then(function (r) { f.blob = blobFromB64(r.data, r.mime || f.mime); return silently(function () { return DB.get('files', f.id).then(function (cur) { if (cur) { cur.blob = f.blob; return _raw.put('files', cur); } }); }).then(function () { return f.blob; }); })
    .finally(function () { delete _blobJobs[f.id]; });
  return _blobJobs[f.id];
}
// ---- ส่งขึ้น ----
async function syncPush(c) {
  var ob = (await outboxAll()).sort(function (a, b) { return a.t < b.t ? -1 : 1; }), done = [], batch = [], size = 0;
  var flush = async function () { if (!batch.length) return; var keys = batch.map(function (x) { return x.k; }); await syncCall(c, 'push', { records: batch.map(function (x) { return x.rec; }) }); done = done.concat(keys); batch = []; size = 0; };
  for (var i = 0; i < ob.length; i++) {
    var e = ob[i], rec;
    if (e.op === 'del') rec = { store: e.store, id: e.id, projectId: '', ts: e.t, deleted: true };
    else {
      var o = await DB.get(e.store, e.id); if (!o) { done.push(e.k); continue; }
      if (e.store === 'files' && !o.driveId && o.blob) {
        var up = await syncCall(c, 'putFile', { id: o.id, mime: o.mime, name: o.name, data: await b64FromBlob(o.blob) });
        o.driveId = up.driveId; await silently(function () { return _raw.put('files', o); });
        var mf = S.files.filter(function (x) { return x.id === o.id; })[0]; if (mf) mf.driveId = up.driveId;
      }
      var d = {}; Object.keys(o).forEach(function (k) { if (k !== 'blob' && (k[0] !== '_' || k === '_ts')) d[k] = o[k]; });
      rec = { store: e.store, id: o.id, projectId: o.projectId || '', ts: o._ts || e.t, deleted: false, data: d };
    }
    var len = JSON.stringify(rec).length;
    if (size + len > 2000000 || batch.length >= 300) await flush();
    batch.push({ k: e.k, rec: rec }); size += len;
  }
  await flush();
  // ลบออกจากคิวเฉพาะรายการที่ไม่มีการแก้ไขใหม่ระหว่างส่ง
  var cur = await outboxAll(), sent = {}; ob.forEach(function (e) { sent[e.k] = e.t; });
  await outboxDel(cur.filter(function (e) { return done.indexOf(e.k) >= 0 && sent[e.k] === e.t; }).map(function (e) { return e.k; }));
  return ob.length;
}
// ---- ดึงลง (ฉบับที่แก้ล่าสุดเป็นฉบับที่ใช้) ----
async function syncPull(c) {
  var cursor = c.cursor || 0, more = true, changed = false;
  while (more) {
    var r = await syncCall(c, 'pull', { since: cursor });
    for (var i = 0; i < r.records.length; i++) {
      var rec = r.records[i]; if (SYNC_STORES.indexOf(rec.store) < 0) continue;
      var local = await DB.get(rec.store, rec.id), pend = await outboxGet(rec.store + '|' + rec.id);
      var localTs = pend ? pend.t : (local && local._ts) || '';
      if (localTs && localTs > rec.ts) continue;
      await silently(async function () {
        if (rec.deleted) { if (local) { await _raw.del(rec.store, rec.id); changed = true; } }
        else {
          var d = rec.data || {}; if (!d.id) return;
          if (rec.store === 'files') d.blob = local && local.blob && (!d.driveId || local.driveId === d.driveId || !local.driveId) ? local.blob : null;
          if (!local || JSON.stringify(Object.assign({}, local, { blob: 0 })) !== JSON.stringify(Object.assign({}, d, { blob: 0 }))) { await _raw.put(rec.store, d); changed = true; }
        }
      });
      if (pend && pend.t <= rec.ts) await outboxDel([pend.k]);
    }
    cursor = r.cursor; more = r.more;
  }
  c.cursor = cursor; await meta('sync', c);
  return changed;
}
async function syncNow(manual) {
  var c = await syncCfg(); if (!c || !c.url) return;
  if (SYNC.running) { SYNC.again = true; return; }
  if (!navigator.onLine) { SYNC.state = 'offline'; syncBadge(); return; }
  SYNC.running = true; SYNC.state = 'busy'; syncBadge();
  try {
    await syncPush(c); var changed = await syncPull(await syncCfg());
    SYNC.pending = (await outboxAll()).length; SYNC.last = new Date(); SYNC.state = 'ok'; SYNC.msg = '';
    c = await syncCfg(); c.lastSync = SYNC.last.toISOString(); await meta('sync', c);
    if (changed) await syncRefresh();
    if (manual) toast('ซิงก์ข้อมูลแล้ว');
  } catch (e) { SYNC.state = 'err'; SYNC.msg = e.message; if (manual) toast(e.message, true); }
  finally { SYNC.running = false; syncBadge(); if (SYNC.again) { SYNC.again = false; scheduleSync(1500); } }
}
function userBusy() {
  if ($('.mbg')) return true;
  var a = document.activeElement; if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && $('#main').contains(a)) return true;
  return !!(S.dailyDraft || S.weekDraft);
}
async function syncRefresh() {
  if (userBusy()) { S.needRefresh = true; toast('มีข้อมูลใหม่จากอีกเครื่อง – จะแสดงเมื่อออกจากหน้านี้', false, 4000); return; }
  S.needRefresh = false; if (S.P) { var id = S.P.id; S.P = null; await loadProject(id); if (!S.P) return go('/'); } render();
}
function scheduleSync(ms) { clearTimeout(SYNC.timer); SYNC.timer = setTimeout(function () { syncNow(false); }, ms || 6000); }
function syncBadge() {
  var b = $('#syncBtn'); if (!b) return;
  syncCfg().then(function (c) {
    if (!c) { b.classList.add('hidden'); return; } b.classList.remove('hidden');
    var t = { busy: '<span class="spin"></span> กำลังซิงก์', offline: 'ออฟไลน์' + (SYNC.pending ? ' • รอส่ง ' + SYNC.pending : ''), err: 'ซิงก์ไม่สำเร็จ',
      ok: 'ซิงก์แล้ว ' + (SYNC.last ? SYNC.last.toTimeString().slice(0, 5) : '') }[SYNC.state] || 'ซิงก์';
    if (SYNC.state === 'ok' && SYNC.pending) t = 'รอส่ง ' + SYNC.pending;
    b.innerHTML = ic('backup') + '<span class="hide-m">' + t + '</span>'; b.title = SYNC.msg || t.replace(/<[^>]+>/g, '');
    b.style.borderColor = SYNC.state === 'err' ? '#ff8a80' : '';
  });
}
async function syncCard() {
  var c = await syncCfg(), sand = aiSandboxed();
  var h = '<div class="card"><h2>ซิงก์ข้อมูลระหว่างเครื่อง (คอมพิวเตอร์ – iPad)</h2>';
  if (sand) return h + '<p class="muted">หน้าทดลองนี้เชื่อมต่อภายนอกไม่ได้ – ตั้งค่าซิงก์ในแอปที่เปิดจาก GitHub Pages</p></div>';
  if (c) {
    var ob = (await outboxAll()).length;
    return h + '<div class="kpis">' + kpi('สถานะ', SYNC.state === 'err' ? 'ผิดพลาด' : SYNC.state === 'busy' ? 'กำลังซิงก์' : 'เชื่อมต่อแล้ว', SYNC.msg || '', SYNC.state === 'err' ? 'bad-t' : 'ok-t') +
      kpi('ซิงก์ล่าสุด', c.lastSync ? th(c.lastSync.slice(0, 10), true) + ' ' + new Date(c.lastSync).toTimeString().slice(0, 5) : '-') + kpi('รอส่งขึ้นคลาวด์', ob + ' รายการ') + '</div>' +
      '<p class="muted" style="margin-top:10px">ซิงก์อัตโนมัติเมื่อเปิดแอป เมื่อแก้ไขข้อมูล และทุก 1 นาที • ถ้าแก้รายการเดียวกันจากสองเครื่อง ฉบับที่แก้ล่าสุดจะเป็นฉบับที่ใช้ • รูปถ่ายโหลดเมื่อเปิดดู</p>' +
      '<div class="row"><button class="btn" data-act="syncNow">' + ic('backup') + 'ซิงก์เดี๋ยวนี้</button><button class="btn ghost bad-t" data-act="syncOff">ยกเลิกการเชื่อมต่อในเครื่องนี้</button></div></div>';
  }
  return h + '<p>เก็บข้อมูลทุกโครงการไว้ใน <b>Google Drive ของคุณ</b> แล้วใช้ร่วมกันได้ทุกเครื่อง • ติดตั้งตัวกลาง (Apps Script) ครั้งเดียวตามขั้นตอนใน README ส่วน "ซิงก์ข้อมูลระหว่างเครื่อง" แล้วนำลิงก์กับรหัสมาใส่ด้านล่าง <b>ทุกเครื่องใช้ลิงก์และรหัสเดียวกัน</b></p>' +
    '<div class="grid2">' + inp('syUrl', 'ลิงก์ Web app (https://script.google.com/macros/s/…/exec)', '', 'url', 'autocomplete="off"') + inp('syKey', 'รหัสซิงก์', '', 'password', 'autocomplete="off"') + '</div>' +
    '<div class="row" style="margin-top:10px"><button class="btn" data-act="syncOn">เชื่อมต่อและซิงก์</button></div>' +
    '<p class="muted">เชื่อมต่อครั้งแรก: ข้อมูลในเครื่องนี้จะถูกส่งขึ้นคลาวด์ และดึงข้อมูลจากเครื่องอื่นลงมารวมกัน</p></div>';
}
async function syncConnect(url, key) {
  url = url.trim(); key = key.trim();
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url) && !/^http:\/\/localhost:\d+\/exec$/.test(url)) throw new Error('ลิงก์ต้องเป็น https://script.google.com/macros/s/…/exec');
  if (!key) throw new Error('กรอกรหัสซิงก์');
  var c = { url: url, key: key, cursor: 0 }, info = await syncCall(c, 'info', {});
  await meta('sync', c);
  // ส่งข้อมูลที่มีอยู่ในเครื่องขึ้นคลาวด์ (ครั้งแรก)
  var entries = [];
  for (var i = 0; i < SYNC_STORES.length; i++) {
    var s = SYNC_STORES[i], rows = await DB.all(s), fix = [];
    rows.forEach(function (o) { if (!o._ts) { o._ts = o.updated || o.created || nowIso(); fix.push(o); } entries.push({ k: s + '|' + o.id, store: s, id: o.id, op: 'put', t: o._ts }); });
    if (fix.length) await _raw.putMany(s, fix);
  }
  if (entries.length) await tx('outbox', 'readwrite', function (os) { entries.forEach(function (e) { os.put(e); }); });
  SYNC.pending = entries.length;
  return info;
}
window.addEventListener('online', function () { scheduleSync(1000); });
document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') scheduleSync(800); });
setInterval(function () { if (document.visibilityState === 'visible') syncNow(false); }, 60000);
window.addEventListener('hashchange', function () { if (S.needRefresh) setTimeout(function () { if (!userBusy()) syncRefresh(); }, 300); });

