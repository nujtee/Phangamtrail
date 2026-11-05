// ระบบจองเดินป่าผาแง่ม — ตรรกะหลัก (ฝั่งเซิร์ฟเวอร์ เป็นแหล่งความจริงเดียว)
// ทุกฟังก์ชันทำงานบนวัตถุ db ในหน่วยความจำ; engine.js เป็นผู้โหลด/บันทึกลง SQLite

/* ===== เวลา (ยึดเวลาไทย UTC+7 เสมอ ไม่ขึ้นกับเครื่องเซิร์ฟเวอร์) ===== */
const TZ = 7 * 3600e3;
export const pad = n => String(n).padStart(2, '0');
const bkk = (t = Date.now()) => new Date(t + TZ);
export const today = () => { const d = bkk(); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` };
export const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) };
export const nowISO = () => new Date().toISOString();
const atBKK = (date, time) => new Date(`${date}T${time}:00+07:00`);
export const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m };
const fromMin = m => pad(Math.floor(m / 60)) + ':' + pad(m % 60);
const TH_MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const TH_DAY = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
export const fmtDate = s => { const d = new Date(s + 'T00:00:00Z'); return `${TH_DAY[d.getUTCDay()]} ${d.getUTCDate()} ${TH_MON[d.getUTCMonth()]} ${d.getUTCFullYear() + 543}` };
const fmtDateS = s => { const d = new Date(s + 'T00:00:00Z'); return `${d.getUTCDate()} ${TH_MON[d.getUTCMonth()]}` };
export const baht = n => '฿' + Number(n || 0).toLocaleString('en-US');
export const uid = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12);

/* ===== บทบาทและสิทธิ์ ===== */
export const ROLES = {
  superadmin: { label: 'ผู้ดูแลระบบสูงสุด', pages: ['dashboard', 'calendar', 'content', 'bookings', 'guides', 'accounting', 'payouts', 'payments', 'notifications', 'users', 'settings', 'audit'] },
  admin: { label: 'ผู้ดูแลระบบ', pages: ['dashboard', 'calendar', 'content', 'bookings', 'guides', 'accounting', 'payouts', 'payments', 'notifications', 'settings', 'audit'] },
  finance: { label: 'เจ้าหน้าที่บัญชี/การเงิน', pages: ['dashboard', 'calendar', 'bookings', 'accounting', 'payouts', 'payments', 'audit'] },
  guidemgr: { label: 'ผู้จัดการไกด์', pages: ['dashboard', 'calendar', 'bookings', 'guides', 'notifications', 'audit'] },
  staff: { label: 'เจ้าหน้าที่ประสานงาน', pages: ['dashboard', 'calendar', 'content', 'bookings', 'guides', 'notifications'] },
  guide: { label: 'ไกด์', pages: ['mytrips'] },
};
export const PERM = {
  confirmPay: ['superadmin', 'admin', 'finance'],
  assign: ['superadmin', 'admin', 'guidemgr', 'staff'],
  markUnavail: ['superadmin', 'admin', 'guidemgr'],
  cancel: ['superadmin', 'admin', 'staff'],
  tripAdmin: ['superadmin', 'admin', 'guidemgr'],
  payout: ['superadmin', 'admin', 'finance'],
  payoutUndo: ['superadmin'],
  editGuides: ['superadmin', 'admin', 'guidemgr', 'staff'],
  users: ['superadmin'],
  settings: ['superadmin', 'admin'],
  payments: ['superadmin', 'admin', 'finance'],
  content: ['superadmin', 'admin', 'staff'],
};
const can = (actor, p) => !!actor && PERM[p].includes(actor.role);

export class UserError extends Error { constructor(m, status = 400) { super(m); this.status = status } }
const fail = m => { throw new UserError(m) };
const need = (actor, p) => { if (!can(actor, p)) throw new UserError('ไม่มีสิทธิ์ทำรายการนี้', 403) };

/* ===== ข้อมูลตั้งต้น (ระบบจริง: ไม่มีไกด์/การจองตัวอย่าง) ===== */
function ph(label, hue) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600"><defs><linearGradient id="a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${hue},55%,78%)"/><stop offset="1" stop-color="hsl(${hue},45%,92%)"/></linearGradient></defs><rect width="800" height="600" fill="url(#a)"/><path d="M0 600 L180 300 L300 430 L470 200 L800 600Z" fill="hsl(${(hue + 120) % 360},30%,38%)"/><path d="M0 600 L260 420 L420 520 L620 380 L800 600Z" fill="hsl(${(hue + 120) % 360},35%,28%)"/><text x="400" y="110" font-family="sans-serif" font-size="40" fill="#fff" text-anchor="middle">${label}</text><text x="400" y="160" font-family="sans-serif" font-size="22" fill="#fff" text-anchor="middle" opacity=".8">รูปตัวอย่าง — เปลี่ยนได้ที่หลังบ้าน</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
export function seedState() {
  const cats = [['c1', 'วิวผาแง่ม', 150], ['c2', 'ทะเลหมอก', 210], ['c3', 'ดอกไม้และธรรมชาติ', 100], ['c4', 'กิจกรรมเดินป่า', 30]];
  return {
    settings: {
      groupFee: 1100, entryRates: { ta: 30, tc: 30, fa: 30, fc: 30 }, maxGroup: 6, payDeadlineMin: 30,
      maxPeoplePerDay: 0, maxGroupsPerSlot: 0, maxGroupsPerGuideDay: 1, minLead: { v: 12, u: 'h' }, seasons: [],
      slotStart: '06:00', slotEnd: '12:00', slotStep: 15, slotV2: true, tripHours: 3, bookAheadDays: 60, rules: '', vehicleFee: 30, lineLinkBy: 'both', lineOa: '',
      split: { guide: 700, village: 100, park: 300 },
      channels: {
        bank: { on: false, mode: 'manual', bankName: '', accountName: '', accountNo: '' },
        promptpay: { on: false, mode: 'manual', id: '', name: '' },
        paypal: { on: false, mode: 'manual', email: '', me: '', passFee: true, feePct: 4.4, feeFixed: 11 },
        alipay: { on: false, mode: 'manual', accountId: '', name: '', image: '' },
        truemoney: { on: false, mode: 'manual', phone: '', name: '', image: '' },
      },
    },
    site: {
      home: { title: 'ผาแง่ม', subtitle: 'เดินป่าชมวิวพร้อมไกด์ชุมชนท้องถิ่น', intro: 'จองรอบเดินป่าออนไลน์ ชำระเงินง่าย ไกด์ท้องถิ่นพาเดินทุกกลุ่ม', hero: '' },
      gallery: { cats: cats.map(([id, name]) => ({ id, name })), imgs: cats.map(([id, name, hue]) => ({ id: uid(), cat: id, src: ph(name, hue), caption: '', at: nowISO() })) },
      stays: [],
      about: { title: 'เกี่ยวกับเรา', body: 'แก้ไขเนื้อหานี้ได้ที่หลังบ้าน เมนู “จัดการเนื้อหาเว็บไซต์”' },
      org: [],
    },
    guides: [], users: [], bookings: [], unavail: [],
    rotSeq: 0, lastGuideId: null, seq: 1000, lastReminder: '',
    audit: [], notifications: [],
  };
}

/* ===== ตัวช่วยคำนวณ ===== */
export const PAX = [['ta', 'คนไทย ผู้ใหญ่'], ['tc', 'คนไทย เด็ก'], ['fa', 'ชาวต่างชาติ ผู้ใหญ่'], ['fc', 'ชาวต่างชาติ เด็ก']];
const paxCount = p => PAX.reduce((a, [k]) => a + (+p[k] || 0), 0);
const entryOf = (p, r) => PAX.reduce((a, [k]) => a + (+p[k] || 0) * (+r[k] || 0), 0);
const gObj = (db, id) => db.guides.find(g => g.id === id);
const gName = (db, id) => { const g = gObj(db, id); return g ? `${g.firstName} ${g.lastName}` : '-' };
const byId = (db, id) => db.bookings.find(b => b.id === id) || fail('ไม่พบรายการจอง');
export const activeGuides = db => db.guides.filter(g => g.active).sort((a, b) => a.priority - b.priority);
export function slotList(db) { const s = db.settings, o = []; for (let m = toMin(s.slotStart); m <= toMin(s.slotEnd); m += Math.max(5, +s.slotStep || 15)) o.push(fromMin(m)); return o }
function guideBusy(db, gid, date, time, exceptId) {
  const dur = db.settings.tripHours * 60, st = toMin(time);
  return db.bookings.some(b => b.id !== exceptId && b.guideId === gid && b.status !== 'cancelled' && b.trip !== 'paidcancel' && b.date === date && Math.abs(toMin(b.time) - st) < dur);
}
const unavailOn = (db, gid, date) => db.unavail.some(u => u.guideId === gid && u.date === date);
const guideDayCount = (db, gid, date, exceptId) => db.bookings.filter(b => b.id !== exceptId && b.guideId === gid && b.status !== 'cancelled' && b.trip !== 'paidcancel' && b.date === date).length;
function guideBlocked(db, gid, date, time, exceptId, b) {
  const cap = +db.settings.maxGroupsPerGuideDay || 0;
  return (cap > 0 && guideDayCount(db, gid, date, exceptId) >= cap) || guideBusy(db, gid, date, time, exceptId) || unavailOn(db, gid, date) || !!(b && (b.declined || []).some(d => d.guideId === gid));
}
const dayGuides = (db, date) => activeGuides(db).filter(g => !unavailOn(db, g.id, date));
const DONE = ['completed', 'noshow', 'paidcancel'];
const isDone = b => DONE.includes(b.trip);
const isLocked = b => b.trip === 'started' || isDone(b) || b.manual;
function normalizePriorities(db, firstId) {
  const L = [...db.guides].sort((a, b) => (a.active ? 0 : 1) - (b.active ? 0 : 1) || a.priority - b.priority || (a.id === firstId ? -1 : b.id === firstId ? 1 : 0));
  L.forEach((g, i) => g.priority = i + 1);
}
function moveToLast(db, gid) { const g = gObj(db, gid); if (!g) return; g.priority = Math.max(...db.guides.map(x => x.priority)) + 1; normalizePriorities(db, null) }

/* ===== ฤดูกาล / จองล่วงหน้า ===== */
function earliestBooking(db) {
  const l = db.settings.minLead || { v: 0, u: 'h' }, v = +l.v || 0, d = new Date();
  if (l.u === 'm') d.setUTCMonth(d.getUTCMonth() + v); else d.setTime(d.getTime() + v * (l.u === 'd' ? 86400e3 : 3600e3));
  return d;
}
const slotOpen = (db, date, time) => atBKK(date, time) >= earliestBooking(db);
function seasonCovers(x, date) {
  if (x.kind === 'date') return date >= x.from && date <= x.to;
  const m = +date.slice(5, 7), f = +x.from, t = +x.to; return f <= t ? (m >= f && m <= t) : (m >= f || m <= t);
}
const closedSeason = (db, date) => (db.settings.seasons || []).find(x => x.active && seasonCovers(x, date));
const seasonText = x => x.kind === 'date' ? `${fmtDate(x.from)} – ${fmtDate(x.to)}` : `${TH_MON[x.from - 1]} – ${TH_MON[x.to - 1]} ของทุกปี`;

/* ===== ความจุต่อรอบ ===== */
const freeGuides = (db, date, time) => activeGuides(db).filter(g => !guideBlocked(db, g.id, date, time)).length;
function slotCapacity(db, date, time, people) {
  const s = db.settings, dur = s.tripHours * 60, cap = +s.maxGroupsPerGuideDay || 0;
  const live = db.bookings.filter(b => b.status !== 'cancelled' && b.trip !== 'paidcancel' && b.date === date), pend = live.filter(b => !b.guideId);
  let free = freeGuides(db, date, time) - pend.filter(b => Math.abs(toMin(b.time) - toMin(time)) < dur).length;
  if (cap > 0) { const dayLeft = dayGuides(db, date).reduce((a, g) => a + Math.max(0, cap - guideDayCount(db, g.id, date)), 0) - pend.length; free = Math.min(free, dayLeft) }
  if (+s.maxGroupsPerSlot > 0) free = Math.min(free, +s.maxGroupsPerSlot - live.filter(b => b.time === time).length);
  let reason = free <= 0 ? 'เต็ม' : '';
  if (+s.maxPeoplePerDay > 0) { const left = +s.maxPeoplePerDay - live.reduce((a, b) => a + b.people, 0); if (left < (people || 1)) { free = 0; reason = left > 0 ? `เหลือ ${left} ที่` : 'เต็มวัน' } }
  return { free: Math.max(0, free), reason };
}
export function availability(db, date, people) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) fail('วันที่ไม่ถูกต้อง');
  const cs = closedSeason(db, date);
  if (cs) return { date, closed: { name: cs.name, text: seasonText(cs) }, slots: [] };
  if (date > addDays(today(), db.settings.bookAheadDays)) return { date, tooFar: true, slots: [] };
  if (!dayGuides(db, date).length) return { date, noGuide: true, slots: [] };
  return {
    date, slots: slotList(db).map(t => {
      if (!slotOpen(db, date, t)) return { t, free: 0, reason: 'lead' };
      const c = slotCapacity(db, date, t, people); return { t, free: c.free, reason: c.reason };
    })
  };
}

/* ===== แจ้งเตือน / log ===== */
function log(db, action, detail) {
  const a = db.$actor;
  db.$audit.push({ id: uid(), at: nowISO(), userId: a?.id || '-', userName: a?.name || 'ระบบ', action, detail });
}
const SITE_URL = 'https://phangamtrail.com';
function notifyGuide(db, g, b, kind) {
  const head = { paidcancel: 'ℹ️ ลูกค้ายกเลิก (คุณยังได้รับค่าไกด์ตามปกติ และคิวของคุณย้ายไปลำดับสุดท้าย)', new: '📅 งานนำเที่ยวใหม่', cancel: '❌ ยกเลิกงานนำเที่ยว', remind: '⏰ เตือนงานนำเที่ยวพรุ่งนี้', test: '🔔 ทดสอบการแจ้งเตือน', job: '📋 แจ้งงานนำเที่ยวของคุณ' }[kind];
  const link = kind === 'cancel' || kind === 'paidcancel' ? '' : `\n\nเข้าระบบไกด์ (ดูงาน/กดเริ่ม-สิ้นสุด/แจ้งไม่ว่าง):\n${SITE_URL}/#admin-mytrips`;
  const msg = `[ผาแง่ม] ${head}\nรหัสจอง ${b.code}\nวันที่ ${fmtDate(b.date)} เวลา ${b.time} น.\nผู้จอง ${b.name} (${b.people} คน) โทร ${b.phone}${link}`;
  const base = { at: nowISO(), guideId: g.id, bookingId: b.id || '', message: msg, status: 'pending' };
  db.$notify.push({ ...base, id: uid(), channel: 'line', to: g.lineUserId || '', toLabel: g.line || '' });
  if (g.email) db.$notify.push({ ...base, id: uid(), channel: 'email', to: g.email, toLabel: g.email, subject: `[ผาแง่ม] ${head} ${b.code}` });
}

function notifyCustomer(db, b, kind) {
  if (!b.email) return;
  const det = `รหัสจอง: ${b.code}\nวันที่: ${fmtDate(b.date)}\nเวลาออกเดินทาง: ${b.time} น.\nจำนวน: ${b.people} คน (${PAX.filter(([k]) => b.pax?.[k]).map(([k, l]) => `${l} ${b.pax[k]}`).join(', ')})${b.vehicles ? `\nรถยนต์: ${b.vehicles} คัน` : ''}\nผู้จอง: ${b.name} โทร ${b.phone}\nยอดชำระ: ${baht(b.paidAmount || b.total)}`;
  const T = {
    slip: ['ได้รับสลิปแล้ว — รอเจ้าหน้าที่ตรวจสอบ', `เรียน คุณ${b.name}\n\nเราได้รับหลักฐานการชำระเงินของการจอง ${b.code} แล้ว เจ้าหน้าที่จะตรวจสอบและแจ้งผลทางอีเมลนี้อีกครั้ง\n\n${det}`],
    confirmed: ['การจองเสร็จสมบูรณ์ ✅', `เรียน คุณ${b.name}\n\nการชำระเงินได้รับการยืนยันแล้ว การจองของคุณเสร็จสมบูรณ์\n\n${det}\nสถานะ: ชำระแล้ว — จองสำเร็จ\n\nกรุณามาถึงจุดนัดพบก่อนเวลาออกเดินทาง 15 นาที\nตรวจสอบการจองได้ที่ https://phangamtrail.com (เมนู "ตรวจสอบการจอง")\nชำระแล้วไม่คืนเงินทุกกรณี · ขอเลื่อนวันได้โดยติดต่อเจ้าหน้าที่`],
  }[kind];
  db.$notify.push({ id: uid(), at: nowISO(), guideId: null, custName: b.name, bookingId: b.id, channel: 'email', to: b.email, toLabel: b.email, subject: `[ผาแง่ม] ${T[0]} ${b.code}`, message: T[1], status: 'pending' });
}

/* ===== คิวไกด์ (คิววนต่อเนื่อง ไม่นับวัน) ===== */
function streamNext(db, ptr, b) {
  const G = activeGuides(db); if (!G.length) return null; const i = G.findIndex(g => g.id === ptr), st = i >= 0 ? i + 1 : 0;
  for (let k = 0; k < G.length; k++) { const g = G[(st + k) % G.length]; if (!b || !guideBlocked(db, g.id, b.date, b.time, b.id, b)) return g }
  return null;
}
function autoAssign(db, b) {
  const g = streamNext(db, db.lastGuideId, b);
  if (g) { b.guideId = g.id; b.trip = 'assigned'; db.lastGuideId = g.id; notifyGuide(db, g, b, 'new'); return g }
  b.guideId = null; b.trip = 'unassigned'; return null;
}
/* ลำดับคิว = วันเดินจริง → เวลา → ลำดับการชำระ (กลุ่มที่เดินก่อนได้ไกด์ก่อน; กลุ่มใหม่ที่เดินก่อนแทรกเข้ามา → คิวหลังจากนั้นขยับ) */
const qKey = b => `${b.date}|${b.time}|${String(b.qn ?? 0).padStart(9, '0')}`;
function assignOnPay(db, b) { b.qn = db.rotSeq++; rerunFrom(db, qKey(b)); return gObj(db, b.guideId) || null }
function rerunFrom(db, startKey) {
  const all = db.bookings.filter(b => b.status !== 'cancelled' && b.qn != null).sort((a, b) => qKey(a).localeCompare(qKey(b))), t = today();
  const prev = [...all].reverse().find(b => qKey(b) < startKey && b.guideId && !b.manual); let ptr = prev ? prev.guideId : null;
  const seg = all.filter(b => qKey(b) >= startKey), before = new Map();
  seg.forEach(b => { if (!isLocked(b) && b.date >= t) { before.set(b.id, b.guideId); b.guideId = null } });
  const changes = [];
  seg.forEach(b => {
    if (!before.has(b.id)) { if (!b.manual && b.guideId) ptr = b.guideId; return }
    const g = streamNext(db, ptr, b); b.guideId = g ? g.id : null; b.trip = g ? 'assigned' : 'unassigned'; if (g) ptr = g.id;
    const old = before.get(b.id);
    if (old !== b.guideId) { changes.push({ b, old, nw: b.guideId }); if (old && gObj(db, old)) notifyGuide(db, gObj(db, old), b, 'cancel'); if (g) notifyGuide(db, g, b, 'new') }
  });
  db.lastGuideId = ptr;
  changes.forEach(c => log(db, 'assign', `จัดคิวใหม่ ${c.b.code} (${fmtDateS(c.b.date)} ${c.b.time}): ${c.old ? gName(db, c.old) : '-'} → ${c.nw ? gName(db, c.nw) : 'รอมอบหมาย'}`));
  return changes;
}
function markGuideUnavailable(db, gid, date, reason, bookingId) {
  const u = db.$actor, g = gObj(db, gid) || fail('ไม่พบไกด์');
  if (bookingId) { const b = byId(db, bookingId); b.declined = b.declined || []; b.declined.push({ guideId: gid, reason, byName: u.name, at: nowISO() }); b.manual = false }
  else { db.unavail.push({ id: uid(), guideId: gid, date, reason, byName: u.name, byRole: u.role, at: nowISO() }); db.bookings.filter(b => b.date === date && b.guideId === gid && b.manual).forEach(b => b.manual = false) }
  moveToLast(db, gid);
  log(db, u.role === 'guide' ? 'decline' : 'unavail', `${g.firstName} ${g.lastName} ไม่ว่าง ${bookingId ? 'งาน ' + byId(db, bookingId).code : 'ทั้งวัน'} ${fmtDate(date)} — เหตุผล: ${reason} · ย้ายไปลำดับสุดท้าย (${g.priority})`);
  const aff = db.bookings.filter(b => b.status !== 'cancelled' && b.qn != null && b.date === date && !isLocked(b) && (bookingId ? b.id === bookingId : b.guideId === gid));
  return aff.length ? rerunFrom(db, aff.map(qKey).sort()[0]) : [];
}

/* ===== ชำระเงิน ===== */
function paypalCharge(db, total) {
  const c = db.settings.channels.paypal; if (!c.passFee) return { charge: total, fee: 0 };
  const charge = Math.ceil((total + (+c.feeFixed || 0)) / (1 - (+c.feePct || 0) / 100)); return { charge, fee: charge - total };
}
function confirmPayment(db, b, how) {
  b.status = 'paid'; b.paidConfirmedBy = db.$actor?.name || 'ระบบอัตโนมัติ'; b.paidConfirmedAt = nowISO();
  const g = assignOnPay(db, b);
  notifyCustomer(db, b, 'confirmed');
  log(db, 'confirm_payment', `${how} ${b.code} ${baht(b.paidAmount || b.total)}${b.payFee ? ` (รวมค่าธรรมเนียม PayPal ${baht(b.payFee)})` : ''} → ${g ? 'ไกด์ ' + gName(db, g.id) : '(ยังไม่มีไกด์ว่าง)'}`);
  return g;
}
export function expirePending(db) {
  const now = nowISO(); let n = 0;
  db.bookings.forEach(b => {
    if (b.status === 'pending' && !b.slip && b.expiresAt && b.expiresAt < now) {
      b.status = 'cancelled'; b.cancelReason = 'หมดเวลาชำระเงิน'; n++;
      log(db, 'cancel', `ยกเลิกอัตโนมัติ ${b.code} — ไม่ชำระภายใน ${db.settings.payDeadlineMin} นาที`);
    }
  });
  return n;
}
export function sendReminders(db) {
  const d = bkk(); if (d.getUTCHours() < 18) return 0; const t = today(); if (db.lastReminder === t) return 0;
  db.lastReminder = t; const tm = addDays(t, 1); let n = 0;
  db.bookings.filter(b => b.date === tm && b.status === 'paid' && b.trip === 'assigned' && b.guideId).forEach(b => { const g = gObj(db, b.guideId); if (g) { notifyGuide(db, g, b, 'remind'); n++ } });
  return n;
}

/* ===== มุมมองข้อมูลที่ส่งให้ client ===== */
const PUBLIC_CH = { bank: ['on', 'mode', 'bankName', 'accountName', 'accountNo'], promptpay: ['on', 'mode', 'id', 'name'], paypal: ['on', 'mode', 'email', 'me', 'passFee', 'feePct', 'feeFixed'], alipay: ['on', 'mode', 'accountId', 'name', 'image'], truemoney: ['on', 'mode', 'phone', 'name', 'image'] };
export function publicState(db) {
  const s = db.settings, ch = {};
  for (const [k, f] of Object.entries(PUBLIC_CH)) { if (s.channels[k]?.on) { ch[k] = {}; f.forEach(x => ch[k][x] = s.channels[k][x]) } else ch[k] = { on: false } }
  return {
    settings: { groupFee: s.groupFee, entryRates: s.entryRates, maxGroup: s.maxGroup, payDeadlineMin: s.payDeadlineMin, slotStart: s.slotStart, slotEnd: s.slotEnd, slotStep: s.slotStep, rules: s.rules || '', receipt: s.receipt || {}, vehicleFee: +(s.vehicleFee ?? 30), bookAheadDays: s.bookAheadDays, minLead: s.minLead, seasons: (s.seasons || []).filter(x => x.active), channels: ch },
    site: db.site, guideCount: activeGuides(db).length, today: today(),
  };
}
export function bookingView(b) {
  if (!b) return null;
  const k = ['id', 'code', 'date', 'time', 'people', 'pax', 'groupFee', 'entryTotal', 'entryRates', 'paidConfirmedAt', 'vehicles', 'vehicleFee', 'vehicleTotal', 'total', 'status', 'expiresAt', 'payChannel', 'paidAmount', 'payFee', 'cancelReason', 'name', 'createdAt'];
  const o = {}; k.forEach(x => o[x] = b[x]); o.slip = !!b.slip; o.phone = b.phone.replace(/^(\d{3})\d+(\d{3})$/, '$1xxxx$2'); if (b.email) o.email = b.email.replace(/^(.{2})[^@]*(@.*)$/, '$1***$2'); return o;
}
const safeUser = u => ({ id: u.id, no: u.no || null, username: u.username, name: u.name, role: u.role, guideId: u.guideId || null, active: u.active });
export function adminState(db, actor) {
  const base = { settings: db.settings, site: db.site, rotSeq: db.rotSeq, lastGuideId: db.lastGuideId, me: safeUser(actor), today: today() };
  if (actor.role === 'guide') {
    return {
      ...base, settings: { ...db.settings, channels: {} }, site: undefined,
      guides: db.guides.filter(g => g.id === actor.guideId), users: [], unavail: db.unavail.filter(u => u.guideId === actor.guideId),
      bookings: db.bookings.filter(b => b.guideId === actor.guideId && b.status !== 'cancelled'), audit: [], notifications: [],
    };
  }
  return {
    ...base, guides: db.guides, users: db.users.map(safeUser), unavail: db.unavail, bookings: db.bookings,
    audit: db.audit, notifications: db.notifications,
  };
}

/* ===== คำสั่งจากหน้าเว็บสาธารณะ ===== */
export const publicActions = {
  availability(db, p) { return availability(db, p.date, +p.people || 1) },
  createBooking(db, p) {
    const s = db.settings, pax = { ta: +p.pax?.ta || 0, tc: +p.pax?.tc || 0, fa: +p.pax?.fa || 0, fc: +p.pax?.fc || 0 }, people = paxCount(pax);
    if (people < 1 || people > s.maxGroup) fail(`จำนวนคนต้องอยู่ระหว่าง 1–${s.maxGroup} คน`);
    if (Object.values(pax).some(v => v < 0 || !Number.isInteger(v))) fail('จำนวนคนไม่ถูกต้อง');
    const name = String(p.name || '').trim().slice(0, 120), phone = String(p.phone || '').replace(/\D/g, '');
    if (!name) fail('กรุณากรอกชื่อ-นามสกุล');
    if (!/^0\d{8,9}$/.test(phone) && !/^\d{8,15}$/.test(phone)) fail('กรุณากรอกเบอร์โทรให้ถูกต้อง');
    const email = String(p.email || '').trim().slice(0, 120);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) fail('กรุณากรอกอีเมลให้ถูกต้อง');
    if ((s.rules || '').trim() && !p.acceptRules) fail('กรุณาอ่านและยอมรับกฎระเบียบก่อนจอง');
    if (!slotList(db).includes(p.time)) fail('กรุณาเลือกเวลาออกเดินทาง');
    const av = availability(db, p.date, people);
    if (av.closed) fail(`วันนี้ปิดรับจอง: ${av.closed.name}`);
    if (av.tooFar) fail(`จองล่วงหน้าได้ไม่เกิน ${s.bookAheadDays} วัน`);
    const sl = av.slots.find(x => x.t === p.time);
    if (!sl || sl.reason === 'lead') fail('รอบนี้ต้องจองล่วงหน้ามากกว่านี้ กรุณาเลือกรอบอื่น');
    if (sl.free <= 0) fail('รอบนี้เต็มแล้ว กรุณาเลือกรอบอื่น');
    if (db.bookings.filter(b => b.phone === phone && b.status === 'pending').length >= 3) fail('เบอร์นี้มีการจองที่รอชำระอยู่หลายรายการ กรุณาชำระหรือรอให้หมดเวลาก่อน');
    const vehicles = Math.max(0, Math.min(10, Math.floor(+p.vehicles || 0))), vehicleFee = +(s.vehicleFee ?? 30), vehicleTotal = vehicles * vehicleFee;
    const entryTotal = entryOf(pax, s.entryRates), created = nowISO();
    const b = {
      id: uid(), code: 'PG' + (++db.seq), qn: null, date: p.date, time: p.time, people, pax, entryRates: { ...s.entryRates },
      name, phone, email, rulesAccepted: !!(s.rules || '').trim(), line: String(p.line || '').trim().slice(0, 60), note: String(p.note || '').trim().slice(0, 500),
      groupFee: +s.groupFee, entryTotal, vehicles, vehicleFee, vehicleTotal, total: +s.groupFee + entryTotal + vehicleTotal, split: { ...s.split },
      status: 'pending', slip: null, paidConfirmedBy: null, paidConfirmedAt: null, guideId: null, trip: 'unassigned', startedAt: null, endedAt: null,
      payout: { paid: false }, createdAt: created, expiresAt: new Date(Date.parse(created) + (+s.payDeadlineMin || 30) * 60e3).toISOString(),
    };
    db.bookings.push(b);
    db.$actor = { id: '-', name: 'ลูกค้า (' + name + ')', role: 'public' };
    log(db, 'booking', `จองใหม่ ${b.code} ${fmtDate(b.date)} ${b.time} · ${people} คน · ${baht(b.total)}`);
    return { booking: bookingView(b) };
  },
  lookup(db, p) {
    const code = String(p.code || '').trim().toUpperCase(), phone = String(p.phone || '').replace(/\D/g, '');
    const b = db.bookings.find(x => x.code === code && x.phone === phone);
    if (!b) fail('ไม่พบการจอง ตรวจสอบรหัสและเบอร์โทร');
    return { booking: bookingView(b) };
  },
  slip(db, p) { // p: {code, phone, channel, url} — url ได้จากการอัปโหลดเข้า R2 แล้ว
    const code = String(p.code || '').trim().toUpperCase(), phone = String(p.phone || '').replace(/\D/g, '');
    const b = db.bookings.find(x => (x.id === p.id || x.code === code) && x.phone === phone) || fail('ไม่พบการจอง');
    if (b.status !== 'pending') fail('รายการนี้ไม่อยู่ในสถานะรอชำระ');
    const ch = db.settings.channels[p.channel]; if (!ch?.on) fail('ช่องทางชำระเงินไม่ถูกต้อง');
    const qr = String(p.qr || '').trim().slice(0, 512), hash = String(p.hash || '').slice(0, 64);
    const dup = db.bookings.find(x => x !== b && x.slip && ((qr && x.slipQr === qr) || (hash && x.slipHash === hash)));
    if (dup) fail(`สลิปนี้เคยถูกใช้แล้วกับการจอง ${dup.code} — กรุณาใช้สลิปของการโอนครั้งนี้ หากเข้าใจผิดกรุณาติดต่อเจ้าหน้าที่`);
    b.slip = p.url; b.payChannel = p.channel; b.slipQr = qr || null; b.slipHash = hash || null; b.slipAt = nowISO();
    if (p.channel === 'paypal') { const x = paypalCharge(db, b.total); b.paidAmount = x.charge; b.payFee = x.fee } else { b.paidAmount = b.total; b.payFee = 0 }
    db.$actor = { id: '-', name: 'ลูกค้า (' + b.name + ')', role: 'public' };
    log(db, 'slip', `แนบหลักฐานการชำระ ${b.code} ผ่าน ${p.channel}${qr ? ' (อ่าน QR สลิปได้)' : ' (อ่าน QR สลิปไม่ได้ — ตรวจด้วยตา)'}`);
    // ออโต้: ตรวจสลิปกับผู้ให้บริการ (SlipOK) ผ่าน → ยืนยันทันที / ไม่ผ่านหรือยังไม่เชื่อม → รอเจ้าหน้าที่
    const v = p.verify || null, need = b.paidAmount || b.total;
    b.slipVerify = v ? { ok: !!v.ok, amount: +v.amount || 0, ref: String(v.ref || '').slice(0, 80), msg: String(v.msg || '').slice(0, 200), at: nowISO() } : null;
    if (ch.mode === 'auto' && v?.ok && +v.amount >= need) {
      db.$actor = { id: 'auto', name: 'ระบบอัตโนมัติ (ตรวจสลิป)', role: 'system' };
      confirmPayment(db, b, 'ยืนยันอัตโนมัติ (สลิปผ่านการตรวจ)');
      return { booking: bookingView(b), verified: true };
    }
    notifyCustomer(db, b, 'slip');
    return { booking: bookingView(b), verified: false, verifyMsg: v && !v.ok ? b.slipVerify.msg : '' };
  },
};

/* ===== คำสั่งหลังบ้าน (ต้องเข้าสู่ระบบ + ตรวจสิทธิ์) ===== */
const ownTrip = (db, b) => db.$actor.role === 'guide' && b.guideId === db.$actor.guideId;
const str = (v, n = 200) => String(v ?? '').trim().slice(0, n);
export const adminActions = {
  confirmPay(db, p) {
    need(db.$actor, 'confirmPay'); const b = byId(db, p.id);
    if (b.status !== 'pending') fail('รายการนี้ไม่อยู่ในสถานะรอชำระ');
    if (!b.paidAmount) b.paidAmount = b.total;
    const g = confirmPayment(db, b, 'ยืนยันรับเงิน (แมนนวล)');
    return { msg: g ? `ยืนยันแล้ว → ไกด์ ${gName(db, g.id)}` : 'ยืนยันแล้ว แต่ยังไม่มีไกด์ว่าง' };
  },
  cancelBooking(db, p) {
    need(db.$actor, 'cancel'); const b = byId(db, p.id);
    if (b.status !== 'pending') fail('ยกเลิกได้เฉพาะรายการที่ยังไม่ชำระ (รายการที่ชำระแล้วใช้ “ลูกค้ายกเลิก”)');
    b.status = 'cancelled'; b.cancelReason = 'ยกเลิกโดยเจ้าหน้าที่'; log(db, 'cancel', `ยกเลิก ${b.code}`); return { msg: 'ยกเลิกแล้ว' };
  },
  noshow(db, p) {
    const b = byId(db, p.id); if (!(can(db.$actor, 'tripAdmin') || ownTrip(db, b))) need(db.$actor, 'tripAdmin');
    if (b.status !== 'paid' || b.trip !== 'assigned' || !b.guideId) fail('บันทึกลูกค้าไม่มาได้เฉพาะงานที่ชำระแล้วและยังไม่เริ่มเดินทาง');
    if (b.date > today()) fail('บันทึกลูกค้าไม่มาได้ตั้งแต่วันเดินป่าเป็นต้นไป');
    b.trip = 'noshow'; b.endedAt = nowISO(); b.closeNote = 'แจ้งโดย ' + db.$actor.name; moveToLast(db, b.guideId);
    log(db, 'noshow', `ลูกค้าไม่มา ${b.code} — ไกด์ ${gName(db, b.guideId)} ได้ค่าไกด์ ${baht(b.split.guide)} · ย้ายไปลำดับสุดท้าย`);
    return { msg: 'บันทึกแล้ว — ส่งค่าไกด์ไปหน้าเบิกจ่าย และย้ายไกด์ไปต่อท้ายคิว' };
  },
  paidcancel(db, p) {
    need(db.$actor, 'cancel'); const b = byId(db, p.id);
    if (b.status !== 'paid' || isLocked({ ...b, manual: false })) fail('รายการนี้ยกเลิกไม่ได้');
    const g = gObj(db, b.guideId); b.trip = 'paidcancel'; b.endedAt = nowISO(); b.closeNote = 'แจ้งโดย ' + db.$actor.name;
    if (g) { notifyGuide(db, g, b, 'paidcancel'); moveToLast(db, g.id) }
    log(db, 'paidcancel', `ลูกค้ายกเลิก ${b.code} (ไม่คืนเงิน) — ${g ? 'ไกด์ ' + g.firstName + ' ' + g.lastName + ' ได้ค่าไกด์ ' + baht(b.split.guide) + ' · ย้ายไปลำดับสุดท้าย' : 'ไม่มีไกด์ได้รับมอบหมาย'}`);
    return { msg: 'บันทึกการยกเลิกแล้ว' };
  },
  reschedule(db, p) {
    need(db.$actor, 'cancel'); const b = byId(db, p.id);
    if (b.status !== 'paid' || isLocked({ ...b, manual: false })) fail('เลื่อนวันได้เฉพาะงานที่ชำระแล้วและยังไม่เริ่มเดินทาง');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date || '') || !slotList(db).includes(p.time)) fail('กรุณาเลือกวันและเวลา');
    if (p.date < today()) fail('เลื่อนไปวันที่ผ่านมาแล้วไม่ได้');
    const od = b.date, ot = b.time; if (p.date === od && p.time === ot) return { msg: 'ไม่มีการเปลี่ยนแปลง' };
    const oldKey = qKey(b), old = gObj(db, b.guideId); b.date = p.date; b.time = p.time;
    if (b.manual && old && guideBlocked(db, old.id, b.date, b.time, b.id, b)) b.manual = false;
    const ch = rerunFrom(db, [oldKey, qKey(b)].sort()[0]);
    if (old && old.id === b.guideId && !ch.some(c => c.b === b)) notifyGuide(db, old, b, 'new'); // ไกด์เดิม → แจ้งวันใหม่
    log(db, 'reschedule', `เลื่อน ${b.code} ${fmtDateS(od)} ${ot} → ${fmtDateS(b.date)} ${b.time} · ไกด์ ${old ? old.firstName : '-'} → ${b.guideId ? gName(db, b.guideId) : 'รอมอบหมาย'}${ch.length > 1 ? ` (จัดคิวใหม่อีก ${ch.length - 1} งาน)` : ''}`);
    return { msg: 'เลื่อนวันแล้ว' };
  },
  tripStart(db, p) {
    const b = byId(db, p.id); if (!(can(db.$actor, 'tripAdmin') || ownTrip(db, b))) need(db.$actor, 'tripAdmin');
    if (b.status !== 'paid' || b.trip !== 'assigned') fail('เริ่มเดินทางได้เฉพาะงานที่ชำระแล้วและได้รับมอบหมาย');
    b.trip = 'started'; b.startedAt = nowISO(); b.startedBy = db.$actor.name; log(db, 'trip_start', `เริ่มเดินทาง ${b.code} (ไกด์ ${gName(db, b.guideId)})`);
    return { msg: 'บันทึกเวลาเริ่มเดินทางแล้ว' };
  },
  tripEnd(db, p) {
    const b = byId(db, p.id); if (!(can(db.$actor, 'tripAdmin') || ownTrip(db, b))) need(db.$actor, 'tripAdmin');
    if (b.trip !== 'started') fail('ต้องเริ่มการเดินทางก่อน');
    b.trip = 'completed'; b.endedAt = nowISO(); log(db, 'trip_end', `สิ้นสุดเดินทาง ${b.code} (ไกด์ ${gName(db, b.guideId)})`);
    return { msg: 'สิ้นสุดการเดินทางแล้ว' };
  },
  payGuide(db, p) {
    need(db.$actor, 'payout'); const b = byId(db, p.id), g = gObj(db, b.guideId) || fail('ไม่พบไกด์');
    if (b.status !== 'paid' || !isDone(b)) fail('จ่ายได้เมื่อจบงานแล้วเท่านั้น'); if (b.payout?.paid) fail('รายการนี้จ่ายแล้ว');
    if (!g.accountNo) fail('ไกด์ยังไม่มีเลขบัญชี — ให้ผู้จัดการไกด์เพิ่มก่อน');
    const ref = str(p.ref, 80); b.payout = { paid: true, paidAt: nowISO(), paidBy: db.$actor.id, paidByName: db.$actor.name, ref };
    log(db, 'payout_confirm', `ยืนยันจ่ายค่าไกด์ ${g.firstName} ${g.lastName} ${baht(b.split.guide)} (${b.code}) บัญชี ${g.accountNo}${ref ? ' อ้างอิง ' + ref : ''}`);
    return { msg: 'บันทึกการจ่ายเงินแล้ว' };
  },
  payUndo(db, p) {
    need(db.$actor, 'payoutUndo'); const b = byId(db, p.id); if (!b.payout?.paid) fail('รายการนี้ยังไม่ได้จ่าย');
    log(db, 'payout_undo', `ยกเลิกยืนยันจ่าย ${b.code} (เดิมยืนยันโดย ${b.payout.paidByName})`); b.payout = { paid: false }; return { msg: 'ยกเลิกการยืนยันแล้ว' };
  },
  lineLinkSave(db, p) {
    need(db.$actor, 'markUnavail'); const s = db.settings;
    s.lineLinkBy = ['phone', 'name', 'both'].includes(p.lineLinkBy) ? p.lineLinkBy : 'both';
    s.lineOa = str(p.lineOa, 200);
    log(db, 'settings', `ตั้งค่าการผูก LINE ของไกด์: ${{ phone: 'เบอร์โทร', name: 'ชื่อ-นามสกุล', both: 'เบอร์โทร หรือ ชื่อ-นามสกุล' }[s.lineLinkBy]}`);
    return { msg: 'บันทึกการตั้งค่าผูก LINE แล้ว' };
  },
  lineUnlink(db, p) {
    need(db.$actor, 'markUnavail'); const g = gObj(db, p.id) || fail('ไม่พบไกด์'); g.lineUserId = '';
    log(db, 'guide', `ยกเลิกการผูก LINE ของไกด์ ${g.firstName} ${g.lastName}`); return { msg: 'ยกเลิกการผูก LINE แล้ว' };
  },
  reassign(db, p) {
    need(db.$actor, 'assign'); const b = byId(db, p.id), gid = p.guideId || '', old = gObj(db, b.guideId);
    if (b.status !== 'paid' || b.qn == null) fail('มอบหมายได้หลังชำระเงินแล้ว'); if (b.trip === 'started' || isDone(b)) fail('งานนี้เริ่มหรือจบแล้ว');
    if (!gid) { b.manual = false; log(db, 'assign', `${b.code} กลับไปใช้คิวอัตโนมัติ`); rerunFrom(db, qKey(b)); return { msg: 'กลับไปใช้คิวอัตโนมัติแล้ว' } }
    const ng = gObj(db, gid) || fail('ไม่พบไกด์');
    if (guideBlocked(db, gid, b.date, b.time, b.id)) fail(unavailOn(db, gid, b.date) ? 'ไกด์คนนี้แจ้งไม่ว่างในวันดังกล่าว' : 'ไกด์คนนี้ติดงานหรือรับงานครบแล้วในวันนั้น');
    if (old && old.id !== gid) notifyGuide(db, old, b, 'cancel');
    b.guideId = gid; b.trip = 'assigned'; b.manual = true; notifyGuide(db, ng, b, 'new');
    log(db, 'assign', `กำหนดไกด์เอง ${b.code} → ${gName(db, gid)} (เดิม ${old ? old.firstName : '-'})`);
    return { msg: 'มอบหมายและแจ้งเตือนไกด์แล้ว' };
  },
  autoAll(db) {
    need(db.$actor, 'assign');
    const un = db.bookings.filter(b => b.status === 'paid' && b.qn != null && b.trip === 'unassigned' && b.date >= today());
    const n = un.length ? rerunFrom(db, un.map(qKey).sort()[0]).length : 0; return { msg: `จัดคิวใหม่ ${n} งาน` };
  },
  decline(db, p) {
    const b = byId(db, p.id); if (!ownTrip(db, b)) fail('ไม่ใช่งานของคุณ');
    const reason = str(p.reason, 300); if (!reason) fail('กรุณาระบุเหตุผล'); if (b.trip !== 'assigned') fail('งานนี้เริ่มเดินทางแล้ว แจ้งไม่ว่างไม่ได้');
    const res = p.wholeDay ? markGuideUnavailable(db, b.guideId, b.date, reason) : markGuideUnavailable(db, b.guideId, b.date, reason, b.id);
    return { msg: `แจ้งไม่ว่างแล้ว — จัดไกด์ใหม่ ${res.length} งาน` };
  },
  unavail(db, p) {
    need(db.$actor, 'markUnavail'); const reason = str(p.reason, 300); if (!reason) fail('กรุณาระบุเหตุผล');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date || '')) fail('กรุณาเลือกวันที่'); if (unavailOn(db, p.guideId, p.date)) fail('ไกด์คนนี้ถูกแจ้งไม่ว่างวันนั้นแล้ว');
    const res = markGuideUnavailable(db, p.guideId, p.date, reason);
    return { msg: `ย้ายคิวไปลำดับสุดท้าย และจัดไกด์ใหม่ ${res.length} งาน${res.some(c => !c.nw) ? ' (บางงานยังไม่มีไกด์ว่าง)' : ''}` };
  },
  unavailDel(db, p) {
    need(db.$actor, 'markUnavail'); const u = db.unavail.find(x => x.id === p.id) || fail('ไม่พบรายการ');
    db.unavail = db.unavail.filter(x => x !== u); log(db, 'unavail', `ลบวันไม่ว่าง ${gName(db, u.guideId)} ${fmtDate(u.date)}`); return { msg: 'ลบแล้ว' };
  },
  async guideSave(db, p, ctx) {
    need(db.$actor, 'editGuides');
    if (!str(p.firstName) || !str(p.lastName) || !str(p.phone)) fail('กรุณากรอกชื่อ นามสกุล และเบอร์โทรศัพท์');
    let g = p.id && gObj(db, p.id); const isNew = !g;
    const acc = g && db.users.find(u => u.guideId === g.id && u.role === 'guide'), uname = str(p.acctUser, 40) || str(p.phone).replace(/\D/g, ''), pw = String(p.acctPass || '').trim();
    if (!acc && p.createAcct) { if (pw.length < 6) fail('รหัสผ่านบัญชีไกด์ต้องมีอย่างน้อย 6 ตัว'); if (db.users.some(u => u.username === uname)) fail(`ชื่อผู้ใช้ "${uname}" มีคนใช้แล้ว`) }
    if (acc && pw && pw.length < 6) fail('รหัสผ่านต้องมีอย่างน้อย 6 ตัว');
    if (isNew) { g = { id: 'g' + uid(), lineUserId: '' }; db.guides.push(g) }
    Object.assign(g, { firstName: str(p.firstName, 60), lastName: str(p.lastName, 60), bankName: str(p.bankName, 60), accountNo: str(p.accountNo, 40), email: str(p.email, 120), phone: str(p.phone, 20), line: str(p.line, 60), priority: +p.priority || db.guides.length, active: !!p.active });
    if ('lineUserId' in p && can(db.$actor, 'markUnavail')) g.lineUserId = str(p.lineUserId, 64);
    normalizePriorities(db, g.id); log(db, 'guide', `${isNew ? 'เพิ่ม' : 'แก้ไข'}ไกด์ ${g.firstName} ${g.lastName} (ลำดับ ${g.priority})`);
    let msg = 'บันทึกแล้ว';
    if (!acc && p.createAcct) { db.users.push({ id: 'u' + uid(), username: uname, pw: await ctx.hash(pw), name: g.firstName + ' ' + g.lastName, role: 'guide', guideId: g.id, active: true }); log(db, 'user', `สร้างบัญชีไกด์ ${uname} ให้ ${g.firstName} ${g.lastName}`); msg = `บันทึกแล้ว · ไกด์เข้าระบบด้วย ${uname}` }
    if (acc && pw) { acc.pw = await ctx.hash(pw); log(db, 'user', `ตั้งรหัสผ่านใหม่ให้บัญชีไกด์ ${acc.username}`) }
    return { msg };
  },
  guideToggle(db, p) { need(db.$actor, 'editGuides'); const g = gObj(db, p.id) || fail('ไม่พบไกด์'); g.active = !g.active; normalizePriorities(db, null); log(db, 'guide', `${g.active ? 'เปิด' : 'ปิด'}ใช้งานไกด์ ${g.firstName}`); return {} },
  guideMove(db, p) {
    need(db.$actor, 'editGuides'); const L = [...db.guides].sort((a, b) => a.priority - b.priority), i = L.findIndex(g => g.id === p.id), j = i + (+p.d);
    if (i < 0 || j < 0 || j >= L.length) return {}; [L[i].priority, L[j].priority] = [L[j].priority, L[i].priority];
    log(db, 'guide', `ปรับลำดับ ${L[i].firstName} ↔ ${L[j].firstName}`); return {};
  },
  notifyJobs(db, p) {
    need(db.$actor, 'assign'); const ids = new Set(Array.isArray(p.ids) ? p.ids : []);
    const L = db.bookings.filter(b => ids.has(b.id) && b.status === 'paid' && b.guideId && b.date >= today() && !isDone(b));
    if (!L.length) fail('ไม่มีงานที่แจ้งได้');
    const noCh = new Set();
    L.forEach(b => { const g = gObj(db, b.guideId); if (!g) return; notifyGuide(db, g, b, 'job'); if (!g.lineUserId && !g.email) noCh.add(g.firstName) });
    log(db, 'notify', `แจ้งงานไกด์ ${L.length} งาน: ${L.map(b => `${b.code}→${gName(db, b.guideId)}`).join(', ')}`);
    return { msg: `ส่งแจ้งเตือน ${L.length} งานแล้ว${noCh.size ? ` · ⚠ ${[...noCh].join(', ')} ยังไม่ผูก LINE และไม่มีอีเมล` : ''}` };
  },
  guideTest(db, p) { need(db.$actor, 'editGuides'); const g = gObj(db, p.id) || fail('ไม่พบไกด์'); notifyGuide(db, g, { code: 'TEST', date: today(), time: '06:00', name: 'ทดสอบระบบ', people: 0, phone: '-' }, 'test'); return { msg: 'ส่งแจ้งเตือนทดสอบแล้ว ดูผลที่เมนูการแจ้งเตือน' } },
  async userSave(db, p, ctx) {
    need(db.$actor, 'users'); const username = str(p.username, 40), name = str(p.name, 80), pw = String(p.password || '');
    if (!username || !name) fail('กรุณากรอกข้อมูลให้ครบ'); if (!ROLES[p.role]) fail('ตำแหน่งไม่ถูกต้อง');
    let u = p.id && db.users.find(x => x.id === p.id);
    if (db.users.some(x => x.username === username && x !== u)) fail('ชื่อผู้ใช้นี้มีแล้ว');
    if (!u && pw.length < 8) fail('รหัสผ่านต้องมีอย่างน้อย 8 ตัว'); if (u && pw && pw.length < 8) fail('รหัสผ่านต้องมีอย่างน้อย 8 ตัว');
    if (u && u.id === db.$actor.id && (p.role !== 'superadmin' || !p.active)) fail('ไม่สามารถลดสิทธิ์/ระงับบัญชีตัวเองได้');
    const isNew = !u; if (isNew) { u = { id: 'u' + uid() }; db.users.push(u) }
    Object.assign(u, { username, name, role: p.role, guideId: p.role === 'guide' ? p.guideId || null : null, active: !!p.active }); if (pw) u.pw = await ctx.hash(pw);
    log(db, 'user', `${isNew ? 'เพิ่ม' : 'แก้ไข'}ผู้ใช้ ${u.username} (${ROLES[u.role].label})`); return { msg: 'บันทึกแล้ว' };
  },
  async changePassword(db, p, ctx) {
    const u = db.users.find(x => x.id === db.$actor.id); if (!await ctx.verify(String(p.old || ''), u.pw)) fail('รหัสผ่านเดิมไม่ถูกต้อง');
    if (String(p.new || '').length < 8) fail('รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัว'); u.pw = await ctx.hash(String(p.new)); log(db, 'user', 'เปลี่ยนรหัสผ่านตัวเอง'); return { msg: 'เปลี่ยนรหัสผ่านแล้ว' };
  },
  settingsSave(db, p) {
    need(db.$actor, 'settings'); const s = db.settings, n = k => Math.max(0, +p[k] || 0);
    const split = { guide: n('sp_guide'), village: n('sp_village'), park: n('sp_park') }, groupFee = n('groupFee');
    if (split.guide + split.village + split.park !== groupFee) fail(`ผลรวมสัดส่วน (${baht(split.guide + split.village + split.park)}) ต้องเท่ากับค่าบริการต่อกลุ่ม (${baht(groupFee)})`);
    if (!/^\d\d:\d\d$/.test(p.slotStart || '') || !/^\d\d:\d\d$/.test(p.slotEnd || '') || toMin(p.slotEnd) < toMin(p.slotStart)) fail('รอบเวลาไม่ถูกต้อง');
    if (+p.slotStep && (+p.slotStep < 5 || +p.slotStep > 240)) fail('ระยะห่างแต่ละรอบต้องอยู่ระหว่าง 5–240 นาที');
    Object.assign(s, {
      groupFee, split, maxGroup: Math.max(1, n('maxGroup')), slotStep: Math.min(240, Math.max(5, n('slotStep') || 15)), slotV2: true, tripHours: n('tripHours'), bookAheadDays: Math.max(1, n('bookAheadDays')),
      payDeadlineMin: Math.max(5, n('payDeadlineMin')), maxPeoplePerDay: n('maxPeoplePerDay'), maxGroupsPerSlot: n('maxGroupsPerSlot'), maxGroupsPerGuideDay: n('maxGroupsPerGuideDay'),
      rules: String(p.rules ?? s.rules ?? '').replace(/\r/g, '').slice(0, 5000), slotStart: p.slotStart, slotEnd: p.slotEnd, minLead: { v: n('minLead_v'), u: ['h', 'd', 'm'].includes(p.minLead_u) ? p.minLead_u : 'h' },
      entryRates: Object.fromEntries(PAX.map(([k]) => [k, n('er_' + k)])), vehicleFee: n('vehicleFee'),
    });
    log(db, 'settings', `ปรับตั้งค่า: กลุ่ม ${baht(groupFee)}, ค่าเข้า ${PAX.map(([k]) => s.entryRates[k]).join('/')}, รอบ ${s.slotStart}–${s.slotEnd} ทุก ${s.slotStep} นาที, ไกด์ ${split.guide}/หมู่บ้าน ${split.village}/อุทยาน ${split.park}, สูงสุด ${s.maxGroup} คน, ชำระใน ${s.payDeadlineMin} นาที, จองล่วงหน้า ≥ ${s.minLead.v}${s.minLead.u} ≤ ${s.bookAheadDays} วัน`);
    return { msg: 'บันทึกการตั้งค่าแล้ว' };
  },
  seasonSave(db, p) {
    need(db.$actor, 'settings'); const name = str(p.name, 100); if (!name) fail('กรุณาใส่ชื่อ/เหตุผล');
    const k = p.kind === 'date' ? 'date' : 'month', from = String(p.from || ''), to = String(p.to || '');
    if (k === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from)) fail('วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่ม');
    if (k === 'month' && !(+from >= 1 && +from <= 12 && +to >= 1 && +to <= 12)) fail('เดือนไม่ถูกต้อง');
    const S = db.settings.seasons = db.settings.seasons || []; let x = S.find(y => y.id === p.id); const isNew = !x; if (isNew) { x = { id: 's' + uid() }; S.push(x) }
    Object.assign(x, { name, kind: k, from, to, active: !!p.active }); log(db, 'settings', `${isNew ? 'เพิ่ม' : 'แก้ไข'}ช่วงปิดรับจอง "${name}" (${seasonText(x)})${x.active ? '' : ' — ไม่ใช้งาน'}`); return { msg: 'บันทึกแล้ว' };
  },
  seasonToggle(db, p) { need(db.$actor, 'settings'); const x = (db.settings.seasons || []).find(y => y.id === p.id) || fail('ไม่พบ'); x.active = !x.active; log(db, 'settings', `${x.active ? 'เปิดใช้' : 'ปิดใช้'}ช่วงปิดรับจอง "${x.name}"`); return {} },
  seasonDel(db, p) { need(db.$actor, 'settings'); const x = (db.settings.seasons || []).find(y => y.id === p.id) || fail('ไม่พบ'); db.settings.seasons = db.settings.seasons.filter(y => y !== x); log(db, 'settings', `ลบช่วงปิดรับจอง "${x.name}"`); return {} },
  paymentsSave(db, p) {
    need(db.$actor, 'payments'); const c = db.settings.channels, g = (k, n) => str(p[k + '_' + n]), md = k => p[k + '_mode'] === 'auto' ? 'auto' : 'manual', img = (k) => (p[k + '_image'] !== undefined ? str(p[k + '_image'], 300) : c[k].image);
    const nc = {
      bank: { on: !!p.bank_on, mode: md('bank'), bankName: g('bank', 'bankName'), accountName: g('bank', 'accountName'), accountNo: g('bank', 'accountNo') },
      promptpay: { on: !!p.promptpay_on, mode: md('promptpay'), id: g('promptpay', 'id').replace(/\D/g, ''), name: g('promptpay', 'name') },
      paypal: { on: !!p.paypal_on, mode: md('paypal'), passFee: !!p.paypal_passFee, feePct: Math.max(0, Math.min(20, +g('paypal', 'feePct') || 0)), feeFixed: Math.max(0, +g('paypal', 'feeFixed') || 0), email: g('paypal', 'email'), me: g('paypal', 'me').replace(/^.*paypal\.me\//i, '').replace(/\/.*$/, '') },
      alipay: { on: !!p.alipay_on, mode: md('alipay'), accountId: g('alipay', 'accountId'), name: g('alipay', 'name'), image: img('alipay') },
      truemoney: { on: !!p.truemoney_on, mode: md('truemoney'), phone: g('truemoney', 'phone'), name: g('truemoney', 'name'), image: img('truemoney') },
    };
    const chk = { bank: x => !!(x.accountNo && x.accountName) || 'ใส่ชื่อบัญชีและเลขที่บัญชี', promptpay: x => [10, 13, 15].includes(x.id.length) || 'หมายเลขพร้อมเพย์ต้องเป็น 10 หรือ 13 หลัก', paypal: x => !!(x.email || x.me) || 'ใส่อีเมลหรือชื่อ PayPal.Me', alipay: x => !!(x.image || x.accountId) || 'ใส่ Alipay ID หรืออัปโหลด QR', truemoney: x => !!(x.phone || x.image) || 'ใส่เบอร์หรืออัปโหลด QR' };
    const names = { bank: 'บัญชีธนาคาร', promptpay: 'พร้อมเพย์', paypal: 'PayPal', alipay: 'Alipay', truemoney: 'TrueMoney' };
    for (const k in nc) if (nc[k].on) { const r = chk[k](nc[k]); if (r !== true) fail(`${names[k]}: ${r}`) }
    db.settings.channels = nc; log(db, 'settings', `ปรับช่องทางรับชำระเงิน: ${Object.keys(nc).filter(k => nc[k].on).map(k => `${names[k]} (${nc[k].mode === 'auto' ? 'ออโต้' : 'แมนนวล'})`).join(', ')}`);
    return { msg: Object.values(nc).some(x => x.on) ? 'บันทึกช่องทางรับชำระเงินแล้ว' : 'บันทึกแล้ว — แต่ยังไม่ได้ติ๊ก "เปิดให้ลูกค้าใช้" ลูกค้าจะยังชำระเงินไม่ได้' };
  },
  /* ----- เนื้อหาเว็บไซต์ ----- */
  receiptSave(db, p) {
    need(db.$actor, 'settings'); const img = str(p.image, 300); if (img && !/^\/img\//.test(img)) fail('รูปไม่ถูกต้อง');
    db.settings.receipt = { name: str(p.name, 150), address: String(p.address || '').trim().slice(0, 400), taxId: str(p.taxId, 30), phone: str(p.phone, 60), email: str(p.email, 120), note: String(p.note || '').trim().slice(0, 400), image: img };
    log(db, 'settings', 'แก้ไขหัวใบเสร็จ'); return { msg: 'บันทึกหัวใบเสร็จแล้ว' };
  },
  logoSave(db, p) { need(db.$actor, 'content'); const u = str(p.logo, 300); if (u && !/^\/img\//.test(u)) fail('ไฟล์โลโก้ไม่ถูกต้อง'); db.site.logo = u; log(db, 'content', u ? 'อัปโหลด/เปลี่ยนโลโก้' : 'ลบโลโก้'); return { msg: u ? 'บันทึกโลโก้แล้ว' : 'ลบโลโก้แล้ว' } },
  homeSave(db, p) { need(db.$actor, 'content'); const h = db.site.home; Object.assign(h, { title: str(p.title, 120) || 'ผาแง่ม', subtitle: str(p.subtitle, 300), intro: String(p.intro || '').slice(0, 3000) }); if (p.hero !== undefined) h.hero = str(p.hero, 300); log(db, 'content', 'แก้ไขหน้าหลัก'); return { msg: 'บันทึกหน้าหลักแล้ว' } },
  aboutSave(db, p) { need(db.$actor, 'content'); Object.assign(db.site.about, { title: str(p.title, 120) || 'เกี่ยวกับเรา', body: String(p.body || '').slice(0, 10000) }); log(db, 'content', 'แก้ไขเนื้อหาเกี่ยวกับเรา'); return { msg: 'บันทึกแล้ว' } },
  gcatSave(db, p) { need(db.$actor, 'content'); const name = str(p.name, 80); if (!name) fail('กรุณาใส่ชื่อหมวดหมู่'); const G = db.site.gallery; let id = p.id; if (id) (G.cats.find(c => c.id === id) || fail('ไม่พบหมวด')).name = name; else { id = 'c' + uid(); G.cats.push({ id, name }) } log(db, 'content', `หมวดรูป "${name}"`); return { id } },
  gcatDel(db, p) { need(db.$actor, 'content'); const G = db.site.gallery, c = G.cats.find(x => x.id === p.id) || fail('ไม่พบหมวด'), n = G.imgs.filter(g => g.cat === c.id).length; G.cats = G.cats.filter(x => x !== c); G.imgs = G.imgs.filter(g => g.cat !== c.id); log(db, 'content', `ลบหมวดรูป "${c.name}" (${n} รูป)`); return {} },
  galleryAdd(db, p) { need(db.$actor, 'content'); const G = db.site.gallery; if (!G.cats.some(c => c.id === p.cat)) fail('ไม่พบหมวด'); const urls = (p.urls || []).filter(u => /^\/img\//.test(u)).slice(0, 50); urls.forEach(src => G.imgs.push({ id: uid(), cat: p.cat, src, caption: '', at: nowISO() })); log(db, 'content', `เพิ่ม ${urls.length} รูปในหมวด "${G.cats.find(c => c.id === p.cat).name}"`); return { msg: `เพิ่มแล้ว ${urls.length} รูป` } },
  gimgDel(db, p) { need(db.$actor, 'content'); const G = db.site.gallery; G.imgs = G.imgs.filter(g => g.id !== p.id); log(db, 'content', 'ลบรูปจากรวมภาพ'); return {} },
  gimgCap(db, p) { need(db.$actor, 'content'); const g = db.site.gallery.imgs.find(x => x.id === p.id) || fail('ไม่พบรูป'); g.caption = str(p.caption, 200); return {} },
  staySave(db, p) {
    need(db.$actor, 'content'); if (!str(p.name)) fail('กรุณาใส่ชื่อบ้านพัก'); let link = str(p.link, 500); if (link && !/^https?:\/\//i.test(link)) link = 'https://' + link;
    let x = db.site.stays.find(y => y.id === p.id); const isNew = !x; if (isNew) { x = { id: 'st' + uid() }; db.site.stays.push(x) }
    Object.assign(x, { name: str(p.name, 120), desc: String(p.desc || '').slice(0, 3000), price: str(p.price, 120), phone: str(p.phone, 40), link, imgs: (p.imgs || []).map(u => str(u, 300)).slice(0, 20) });
    log(db, 'content', `${isNew ? 'เพิ่ม' : 'แก้ไข'}บ้านพัก "${x.name}" (${x.imgs.length} รูป)`); return { msg: 'บันทึกแล้ว' };
  },
  stayDel(db, p) { need(db.$actor, 'content'); const x = db.site.stays.find(y => y.id === p.id) || fail('ไม่พบ'); db.site.stays = db.site.stays.filter(y => y !== x); log(db, 'content', `ลบบ้านพัก "${x.name}"`); return {} },
  stayMove(db, p) { need(db.$actor, 'content'); const L = db.site.stays, i = +p.i, j = i + (+p.d); if (i >= 0 && j >= 0 && i < L.length && j < L.length) [L[i], L[j]] = [L[j], L[i]]; return {} },
  orgSave(db, p) {
    need(db.$actor, 'content'); if (!str(p.name) || !str(p.pos)) fail('กรุณาใส่ชื่อและตำแหน่ง'); const S = db.site;
    let o = S.org.find(y => y.id === p.id); const isNew = !o; if (isNew) { o = { id: 'o' + uid() }; S.org.push(o) }
    const desc = id => { const out = [id]; S.org.filter(x => x.parent === id).forEach(x => out.push(...desc(x.id))); return out };
    if (p.parent && desc(o.id).includes(p.parent)) fail('ตั้งให้อยู่ภายใต้ลูกทีมของตัวเองไม่ได้');
    Object.assign(o, { name: str(p.name, 80), pos: str(p.pos, 80), parent: p.parent || '', order: +p.order || 1, photo: p.photo !== undefined ? str(p.photo, 300) : (o.photo || '') });
    log(db, 'content', `${isNew ? 'เพิ่ม' : 'แก้ไข'}ผังผู้บริหาร: ${o.pos} ${o.name}`); return { msg: 'บันทึกแล้ว' };
  },
  orgDel(db, p) { need(db.$actor, 'content'); const S = db.site, o = S.org.find(x => x.id === p.id) || fail('ไม่พบ'); S.org.filter(x => x.parent === o.id).forEach(k => k.parent = o.parent || ''); S.org = S.org.filter(x => x !== o); log(db, 'content', `ลบ "${o.pos}" ออกจากผังผู้บริหาร`); return {} },
};
