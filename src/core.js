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
export const baht = n => (Number(n) < 0 ? '−' : '') + '฿' + Math.abs(Number(n || 0)).toLocaleString('en-US');
export const uid = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12);

/* ===== บทบาทและสิทธิ์ ===== */
export const ROLES = {
  superadmin: { label: 'ผู้ดูแลระบบสูงสุด', pages: ['dashboard', 'calendar', 'content', 'bookings', 'guides', 'fin', 'accounting', 'journal', 'payouts', 'park', 'refund', 'expense', 'close', 'payments', 'village', 'notifications', 'users', 'settings', 'audit'] },
  admin: { label: 'ผู้ดูแลระบบ', pages: ['dashboard', 'calendar', 'content', 'bookings', 'guides', 'fin', 'accounting', 'journal', 'payouts', 'park', 'refund', 'expense', 'close', 'payments', 'village', 'notifications', 'settings', 'audit'] },
  finance: { label: 'เจ้าหน้าที่บัญชี/การเงิน', pages: ['dashboard', 'calendar', 'bookings', 'fin', 'accounting', 'journal', 'payouts', 'park', 'refund', 'expense', 'close', 'payments', 'village', 'audit'] },
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
  acctView: ['superadmin', 'admin', 'finance'], // ดูภาพรวม/สมุดรายวัน/รายงาน
  acctPost: ['superadmin', 'admin', 'finance'], // นำส่งอุทยาน · บันทึกรายจ่าย/รายรับอื่น
  acctSetup: ['superadmin', 'finance'], // เปิดใช้สมุดบัญชี (ยอดยกมา) · ตั้งค่าบัญชี
  acctRev: ['superadmin'], // กลับรายการ · ล้างสมุดบัญชี · เปิดงวดกลับ
  acctClose: ['superadmin', 'finance'], // กระทบยอดธนาคาร · ปิดงวด
  refundApprove: ['superadmin', 'admin'], // ยกเลิกและคืนเงิน (กำหนดยอดคืน)
  refundPay: ['superadmin', 'admin', 'finance'], // โอนคืนแล้ว + แนบสลิป
};
const can = (actor, p) => !!actor && PERM[p].includes(actor.role);

export class UserError extends Error { constructor(m, status = 400, extra = null) { super(m); this.status = status; this.extra = extra } }
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
      slotStart: '06:00', slotEnd: '12:00', slotStep: 15, slotV2: true, tripHours: 3, bookAheadDays: 60, rules: '', vehicleFee: 30, motoFee: 20, lineLinkBy: 'both', lineOa: '',
      split: { guide: 700, village: 100, park: 300 }, extraGuideFee: 700, villageAcct: { bankName: '', accountName: '', accountNo: '' },
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
/* ไกด์ต่อกลุ่ม: 1 คนต่อ maxGroup คน สูงสุด MAX_GUIDES คน (เช่น 7–12 คน = ไกด์ 2 คน) */
export const MAX_GUIDES = 2;
export const guidesFor = (s, people) => Math.min(MAX_GUIDES, Math.max(1, Math.ceil((+people || 1) / Math.max(1, +s.maxGroup || 6))));
const needG = b => Math.max(1, +b.guidesNeeded || 1);
const gIds = b => [b.guideId, b.guide2Id].filter(Boolean);
const hasGuide = (b, gid) => !!gid && (b.guideId === gid || b.guide2Id === gid);
const missingG = b => Math.max(0, needG(b) - gIds(b).length);
const gNames = (db, b) => gIds(b).map(id => gName(db, id)).join(' + ') || '-';
const byId = (db, id) => db.bookings.find(b => b.id === id) || fail('ไม่พบรายการจอง');
export const activeGuides = db => db.guides.filter(g => g.active && !g.reserve).sort((a, b) => a.priority - b.priority); // ไกด์หลัก (อยู่ในคิววน)
/* ===== ไกด์สำรอง: ไม่อยู่ในคิววน · เรียกทีละคนตามลำดับ (rOrder) เมื่อไกด์หลักไม่พอ/ไม่ว่าง · เปิดล่วงหน้ารายวันได้ (g.pre) ===== */
export const reserveGuides = db => db.guides.filter(g => g.active && g.reserve).sort((a, b) => (a.rOrder || 0) - (b.rOrder || 0));
export const RS = db => ({ mode: 'auto', waitMin: 180, nearHours: 12, nearWaitMin: 30, rotate: true, countPre: true, notifyEmpty: true, ...(db.settings.reserve || {}) });
const preGuides = (db, date) => reserveGuides(db).filter(g => (g.pre || []).includes(date) && !unavailOn(db, g.id, date)); // สำรองที่เปิดล่วงหน้าวันนั้น
const capGuides = (db, date) => [...activeGuides(db), ...(RS(db).countPre ? preGuides(db, date) : [])]; // ไกด์ที่นับเป็นที่ว่างให้ลูกค้าจอง
export function slotList(db) { const s = db.settings, o = []; for (let m = toMin(s.slotStart); m <= toMin(s.slotEnd); m += Math.max(5, +s.slotStep || 15)) o.push(fromMin(m)); return o }
function guideBusy(db, gid, date, time, exceptId) {
  const dur = db.settings.tripHours * 60, st = toMin(time);
  return db.bookings.some(b => b.id !== exceptId && hasGuide(b, gid) && b.status !== 'cancelled' && b.trip !== 'paidcancel' && b.date === date && Math.abs(toMin(b.time) - st) < dur);
}
const unavailOn = (db, gid, date) => db.unavail.some(u => u.guideId === gid && u.date === date);
const guideDayCount = (db, gid, date, exceptId) => db.bookings.filter(b => b.id !== exceptId && hasGuide(b, gid) && b.status !== 'cancelled' && b.trip !== 'paidcancel' && b.date === date).length;
function guideBlocked(db, gid, date, time, exceptId, b) {
  const cap = +db.settings.maxGroupsPerGuideDay || 0;
  return (cap > 0 && guideDayCount(db, gid, date, exceptId) >= cap) || guideBusy(db, gid, date, time, exceptId) || unavailOn(db, gid, date) || !!(b && (b.declined || []).some(d => d.guideId === gid));
}
const dayGuides = (db, date) => capGuides(db, date).filter(g => !unavailOn(db, g.id, date));
const DONE = ['completed', 'noshow', 'paidcancel'];
const isDone = b => DONE.includes(b.trip);
const isLocked = b => b.trip === 'started' || isDone(b) || b.manual;
function normalizePriorities(db, firstId) {
  const tie = (a, b) => (a.id === firstId ? -1 : b.id === firstId ? 1 : 0);
  const L = db.guides.filter(g => !g.reserve).sort((a, b) => (a.active ? 0 : 1) - (b.active ? 0 : 1) || a.priority - b.priority || tie(a, b));
  L.forEach((g, i) => g.priority = i + 1);
  const R = db.guides.filter(g => g.reserve).sort((a, b) => (a.active ? 0 : 1) - (b.active ? 0 : 1) || (a.rOrder || 0) - (b.rOrder || 0) || tie(a, b));
  R.forEach((g, i) => { g.rOrder = i + 1; g.priority = 1000 + i + 1 });
}
function moveToLast(db, gid) {
  const g = gObj(db, gid); if (!g) return;
  if (g.reserve) g.rOrder = Math.max(0, ...db.guides.filter(x => x.reserve).map(x => x.rOrder || 0)) + 1;
  else g.priority = Math.max(0, ...db.guides.filter(x => !x.reserve).map(x => x.priority)) + 1;
  normalizePriorities(db, null);
}

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
const freeGuides = (db, date, time) => capGuides(db, date).filter(g => !guideBlocked(db, g.id, date, time)).length;
function slotCapacity(db, date, time, people) {
  const s = db.settings, dur = s.tripHours * 60, cap = +s.maxGroupsPerGuideDay || 0;
  const live = db.bookings.filter(b => b.status !== 'cancelled' && b.trip !== 'paidcancel' && b.date === date), pend = live.filter(b => missingG(b) > 0);
  const W = L => L.reduce((a, b) => a + missingG(b), 0); // จำนวนไกด์ที่ยังต้องใช้ (กลุ่มใหญ่ = 2)
  let free = freeGuides(db, date, time) - W(pend.filter(b => Math.abs(toMin(b.time) - toMin(time)) < dur));
  if (cap > 0) { const dayLeft = dayGuides(db, date).reduce((a, g) => a + Math.max(0, cap - guideDayCount(db, g.id, date)), 0) - W(pend); free = Math.min(free, dayLeft) }
  if (+s.maxGroupsPerSlot > 0) free = Math.min(free, +s.maxGroupsPerSlot - live.filter(b => b.time === time).reduce((a, b) => a + needG(b), 0));
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
  const gn = guidesFor(db.settings, people);
  return {
    date, guides: gn, slots: slotList(db).map(t => {
      if (!slotOpen(db, date, t)) return { t, free: 0, reason: 'lead' };
      const c = slotCapacity(db, date, t, people), f = Math.floor(c.free / gn); // free = จำนวนกลุ่มขนาดนี้ที่ยังรับได้ (กลุ่มใหญ่ใช้ไกด์ 2 คน)
      return { t, free: f, reason: f > 0 ? '' : c.free > 0 ? `ไกด์ว่างไม่พอ (ต้องใช้ ${gn} คน)` : c.reason || 'เต็ม' };
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
  const co = gIds(b).filter(x => x !== g.id).map(x => gName(db, x)), coTxt = needG(b) > 1 ? `\nกลุ่มนี้ใช้ไกด์ ${needG(b)} คน · ไกด์ร่วม: ${co.join(', ') || 'รอมอบหมาย'}` : '';
  const msg = `[ผาแง่ม] ${head}\nรหัสจอง ${b.code}\nวันที่ ${fmtDate(b.date)} เวลา ${b.time} น.\nผู้จอง ${b.name} (${b.people} คน) โทร ${b.phone}${coTxt}${link}`;
  const base = { at: nowISO(), guideId: g.id, bookingId: b.id || '', message: msg, status: 'pending' };
  db.$notify.push({ ...base, id: uid(), channel: 'line', to: g.lineUserId || '', toLabel: g.line || '' });
  if (g.email) db.$notify.push({ ...base, id: uid(), channel: 'email', to: g.email, toLabel: g.email, subject: `[ผาแง่ม] ${head} ${b.code}` });
  db.$notify.push({ ...base, id: uid(), channel: 'push', to: 'guide:' + g.id, toLabel: 'แอป', title: head.replace(/\s*\(.*\)$/, ''), body: `${b.code} · ${fmtDateS(b.date)} ${b.time} น. · ${b.name} (${b.people} คน)`, url: '/#admin-today' });
}
/* แจ้งเตือนในแอปถึงผู้จัดการไกด์/ผู้ดูแลระบบ */
const MGR_ROLES = ['guidemgr', 'admin', 'superadmin'];
function notifyManagers(db, title, body, bookingId) {
  db.$notify.push({ id: uid(), at: nowISO(), guideId: null, bookingId: bookingId || '', channel: 'push', to: 'roles:' + MGR_ROLES.join(','), toLabel: 'ผู้จัดการไกด์ (แอป)', title, body, url: '/#admin-today', message: `${title}\n${body}`, status: 'pending' });
}
export function lateStartAlerts(db) {
  const d = bkk(), t = today(), nowMin = d.getUTCHours() * 60 + d.getUTCMinutes(); let n = 0;
  db.bookings.filter(b => b.date === t && b.status === 'paid' && b.trip === 'assigned' && !b.lateAlert && toMin(b.time) + 15 <= nowMin).forEach(b => {
    b.lateAlert = true; n++; notifyManagers(db, '⏰ ไกด์ยังไม่กดเริ่มเดินทาง', `${b.code} รอบ ${b.time} น. · ไกด์ ${gNames(db, b)} · ${b.name} (${b.people} คน)`, b.id);
  });
  return n;
}

function notifyCustomer(db, b, kind) {
  if (!b.email) return;
  const det = `รหัสจอง: ${b.code}\nวันที่: ${fmtDate(b.date)}\nเวลาออกเดินทาง: ${b.time} น.\nจำนวน: ${b.people} คน (${PAX.filter(([k]) => b.pax?.[k]).map(([k, l]) => `${l} ${b.pax[k]}`).join(', ')})${b.vehicles ? `\nรถยนต์: ${b.vehicles} คัน` : ''}${b.motos ? `\nรถจักรยานยนต์: ${b.motos} คัน` : ''}${needG(b) > 1 ? `\nไกด์นำทาง: ${needG(b)} คน` : ''}\nผู้จอง: ${b.name} โทร ${b.phone}\nยอดชำระ: ${baht(b.paidAmount || b.total)}`;
  const T = {
    slip: ['ได้รับสลิปแล้ว — รอเจ้าหน้าที่ตรวจสอบ', `เรียน คุณ${b.name}\n\nเราได้รับหลักฐานการชำระเงินของการจอง ${b.code} แล้ว เจ้าหน้าที่จะตรวจสอบและแจ้งผลทางอีเมลนี้อีกครั้ง\n\n${det}`],
    refund_ok: ['ยกเลิกการจอง — อยู่ระหว่างคืนเงิน', `เรียน คุณ${b.name}\n\nการจอง ${b.code} ถูกยกเลิกแล้ว และอยู่ระหว่างโอนคืนเงินจำนวน ${baht(b.refund?.amt)}\nเหตุผล: ${b.refund?.reason || '-'}\nโอนคืนเข้า: ${b.refund?.to || '-'}\n\nเจ้าหน้าที่จะแจ้งทางอีเมลนี้อีกครั้งเมื่อโอนคืนเรียบร้อย\n\n${det}`],
    refunded: ['คืนเงินเรียบร้อยแล้ว ✅', `เรียน คุณ${b.name}\n\nเราโอนคืนเงินจำนวน ${baht(b.refund?.amt)} สำหรับการจอง ${b.code} เรียบร้อยแล้ว\nโอนเข้า: ${b.refund?.to || '-'}\nวันที่โอน: ${b.refund?.date ? fmtDate(b.refund.date) : '-'}${b.refund?.ref ? `\nเลขอ้างอิง: ${b.refund.ref}` : ''}\n\nขออภัยในความไม่สะดวก หวังว่าจะได้ต้อนรับในโอกาสหน้า\n\n${det}`],
    confirmed: ['การจองเสร็จสมบูรณ์ ✅', `เรียน คุณ${b.name}\n\nการชำระเงินได้รับการยืนยันแล้ว การจองของคุณเสร็จสมบูรณ์\n\n${det}\nสถานะ: ชำระแล้ว — จองสำเร็จ\n\nกรุณามาถึงจุดนัดพบก่อนเวลาออกเดินทาง 15 นาที\nตรวจสอบการจองได้ที่ https://phangamtrail.com (เมนู "ตรวจสอบการจอง")\nชำระแล้วไม่คืนเงินทุกกรณี · ขอเลื่อนวันได้โดยติดต่อเจ้าหน้าที่`],
  }[kind];
  db.$notify.push({ id: uid(), at: nowISO(), guideId: null, custName: b.name, bookingId: b.id, channel: 'email', to: b.email, toLabel: b.email, subject: `[ผาแง่ม] ${T[0]} ${b.code}`, message: T[1], status: 'pending' });
}

/* ===== คิวไกด์ (คิววนต่อเนื่อง ไม่นับวัน) ===== */
function streamNext(db, ptr, b, skip) {
  const G = activeGuides(db); if (!G.length) return null; const i = G.findIndex(g => g.id === ptr), st = i >= 0 ? i + 1 : 0, sk = [].concat(skip || []);
  for (let k = 0; k < G.length; k++) { const g = G[(st + k) % G.length]; if (!sk.includes(g.id) && (!b || !guideBlocked(db, g.id, b.date, b.time, b.id, b))) return g }
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
  const lastG = b => [b.guide2Id, b.guideId].find(id => id && !gObj(db, id)?.reserve); // ไกด์หลักคนสุดท้ายของงาน (ไม่นับไกด์สำรอง)
  const prev = [...all].reverse().find(b => qKey(b) < startKey && lastG(b) && !b.manual); let ptr = prev ? lastG(prev) : null;
  const seg = all.filter(b => qKey(b) >= startKey), before = new Map(), keepM = new Map();
  seg.forEach(b => { if (!isLocked(b) && b.date >= t) { before.set(b.id, gIds(b)); keepM.set(b.id, gIds(b).filter(id => (b.rlock || []).includes(id))); b.guideId = null; b.guide2Id = null } });
  const changes = [];
  seg.forEach(b => {
    if (!before.has(b.id)) { if (!b.manual && lastG(b)) ptr = lastG(b); return }
    const n = needG(b), keep = (keepM.get(b.id) || []).filter(id => gObj(db, id) && !guideBlocked(db, id, b.date, b.time, b.id, b)), got = [];
    if (b.rlock) b.rlock = keep; // ไกด์สำรองที่รับงานแล้ว = ล็อกไว้ ไม่ถูกย้ายออก
    for (let i = keep.length; i < n; i++) { const g = streamNext(db, ptr, b, [...got, ...keep]); if (!g) break; got.push(g.id); ptr = g.id }
    got.push(...keep);
    for (const g of preGuides(db, b.date)) { if (got.length >= n) break; if (!got.includes(g.id) && !guideBlocked(db, g.id, b.date, b.time, b.id, b)) got.push(g.id) } // สำรองที่เปิดล่วงหน้าวันนั้น (ต่อจากไกด์หลัก)
    b.guideId = got[0] || null; b.guide2Id = got[1] || null; b.trip = got.length ? 'assigned' : 'unassigned';
    const old = before.get(b.id), rm = old.filter(x => !got.includes(x)), add = got.filter(x => !old.includes(x));
    if (rm.length || add.length || got.length < n) changes.push({ b, old, nw: got, short: got.length < n });
    rm.forEach(x => { const g = gObj(db, x); if (g) notifyGuide(db, g, b, 'cancel') });
    add.forEach(x => { const g = gObj(db, x); if (g) notifyGuide(db, g, b, 'new') });
  });
  db.lastGuideId = ptr;
  const nm = L => L.length ? L.map(x => gName(db, x)).join(' + ') : '-';
  changes.filter(c => c.old.join() !== c.nw.join()).forEach(c => log(db, 'assign', `จัดคิวใหม่ ${c.b.code} (${fmtDateS(c.b.date)} ${c.b.time}): ${nm(c.old)} → ${c.nw.length ? nm(c.nw) : 'รอมอบหมาย'}${c.short && c.nw.length ? ` (ยังขาดไกด์ ${needG(c.b) - c.nw.length} คน)` : ''}`));
  return changes;
}
function markGuideUnavailable(db, gid, date, reason, bookingId) {
  const u = db.$actor, g = gObj(db, gid) || fail('ไม่พบไกด์');
  const unlock = b => { if (b.rlock) b.rlock = b.rlock.filter(x => x !== gid); (b.rreq || []).forEach(r => { if (r.gid === gid && r.st === 'pending') { r.st = 'declined'; r.reason = reason; r.endAt = nowISO() } }) };
  if (bookingId) { const b = byId(db, bookingId); b.declined = b.declined || []; b.declined.push({ guideId: gid, reason, byName: u.name, at: nowISO() }); b.manual = false; unlock(b) }
  else { db.unavail.push({ id: uid(), guideId: gid, date, reason, byName: u.name, byRole: u.role, at: nowISO() }); db.bookings.filter(b => b.date === date && (hasGuide(b, gid) || (b.rreq || []).some(r => r.gid === gid))).forEach(b => { if (b.manual && hasGuide(b, gid)) b.manual = false; unlock(b) }) }
  moveToLast(db, gid);
  if (u.role === 'guide') notifyManagers(db, '🙅 ไกด์แจ้งไม่ว่าง', `${g.firstName} ${g.lastName} · ${fmtDateS(date)}${bookingId ? ' งาน ' + byId(db, bookingId).code : ' ทั้งวัน'} — ${reason}`, bookingId);
  log(db, u.role === 'guide' ? 'decline' : 'unavail', `${g.firstName} ${g.lastName} ไม่ว่าง ${bookingId ? 'งาน ' + byId(db, bookingId).code : 'ทั้งวัน'} ${fmtDate(date)} — เหตุผล: ${reason} · ย้ายไปลำดับสุดท้าย (${g.priority})`);
  const aff = db.bookings.filter(b => b.status !== 'cancelled' && b.qn != null && b.date === date && !isLocked(b) && (bookingId ? b.id === bookingId : hasGuide(b, gid)));
  const res = aff.length ? rerunFrom(db, aff.map(qKey).sort()[0]) : [];
  res.filter(c => c.short).forEach(c => notifyManagers(db, '⚠️ มีงานที่ยังไม่มีไกด์', `${c.b.code} · ${fmtDateS(c.b.date)} ${c.b.time} น. · ${c.b.people} คน${c.nw.length ? ` · ยังขาดไกด์ ${needG(c.b) - c.nw.length} คน` : ''}`, c.b.id));
  return res;
}

/* ===== ไกด์สำรอง: ส่งคำขอทีละคน · หมดเวลา/ไม่สะดวก → คนถัดไป ===== */
const pendReq = b => (b.rreq || []).filter(r => r.st === 'pending');
const hhmm = iso => new Date(new Date(iso).getTime() + 7 * 3600e3).toISOString().slice(11, 16);
const dayOf = iso => new Date(new Date(iso).getTime() + 7 * 3600e3).toISOString().slice(0, 10);
const needsReserve = b => b.status === 'paid' && b.qn != null && !isDone(b) && b.trip !== 'started' && missingG(b) > 0 && atBKK(b.date, b.time) > new Date();
const slotFee = b => !b.guideId ? +b.split?.guide || 0 : +(b.split?.guide2 ?? b.split?.guide) || 0; // ค่าไกด์ของตำแหน่งที่ว่าง
function reqBusy(db, gid, b) { // มีคำขอค้างอยู่กับงานอื่นที่เวลาทับกัน
  const dur = db.settings.tripHours * 60;
  return db.bookings.some(x => x.id !== b.id && x.date === b.date && Math.abs(toMin(x.time) - toMin(b.time)) < dur && pendReq(x).some(r => r.gid === gid));
}
function nextReserve(db, b) {
  const asked = new Set((b.rreq || []).filter(r => r.st !== 'cancelled').map(r => r.gid));
  return reserveGuides(db).find(g => !asked.has(g.id) && !hasGuide(b, g.id) && !guideBlocked(db, g.id, b.date, b.time, b.id, b) && !reqBusy(db, g.id, b));
}
function askReserve(db, b, g) {
  const s = RS(db), now = Date.now(), start = atBKK(b.date, b.time).getTime(), near = start - now < s.nearHours * 3600e3;
  const exp = Math.max(now + 5 * 60e3, Math.min(now + (near ? s.nearWaitMin : s.waitMin) * 60e3, start - 15 * 60e3));
  const r = { id: uid(), gid: g.id, at: nowISO(), exp: new Date(exp).toISOString(), st: 'pending', by: db.$actor?.role === 'system' ? 'ระบบ' : db.$actor?.name || 'ระบบ' };
  (b.rreq = b.rreq || []).push(r); b.rempty = false;
  const expTxt = `${dayOf(r.exp) === today() ? '' : fmtDateS(dayOf(r.exp)) + ' '}${hhmm(r.exp)} น.`;
  const msg = `[ผาแง่ม] 🙋 คำขอเปิดใช้ไกด์สำรอง\nไกด์หลักไม่พอในรอบนี้ ขอให้ช่วยนำทาง\nรหัสจอง ${b.code}\nวันที่ ${fmtDate(b.date)} เวลา ${b.time} น.\nกลุ่ม ${b.people} คน · ค่าไกด์ ${baht(slotFee(b))}\nกรุณาตอบภายใน ${expTxt} (ไม่ตอบ = ส่งต่อไกด์สำรองคนถัดไป)\n\nกดรับงาน / ไม่สะดวก:\n${SITE_URL}/#admin-today`;
  const base = { at: nowISO(), guideId: g.id, bookingId: b.id, kind: 'reserve', message: msg, status: 'pending' };
  db.$notify.push({ ...base, id: uid(), channel: 'line', to: g.lineUserId || '', toLabel: g.line || '' });
  if (g.email) db.$notify.push({ ...base, id: uid(), channel: 'email', to: g.email, toLabel: g.email, subject: `[ผาแง่ม] คำขอเปิดใช้ไกด์สำรอง ${b.code} ${fmtDateS(b.date)} ${b.time} น.` });
  db.$notify.push({ ...base, id: uid(), channel: 'push', to: 'guide:' + g.id, toLabel: 'แอป', title: '🙋 คำขอเปิดใช้ไกด์สำรอง', body: `${b.code} · ${fmtDateS(b.date)} ${b.time} น. · ${b.people} คน — ตอบภายใน ${expTxt}`, url: '/#admin-today' });
  notifyManagers(db, '🧭 ส่งคำขอถึงไกด์สำรอง', `${b.code} · ${fmtDateS(b.date)} ${b.time} น. → S${g.rOrder} ${g.firstName} ${g.lastName} (ตอบภายใน ${expTxt})`, b.id);
  log(db, 'reserve', `ส่งคำขอถึงไกด์สำรอง S${g.rOrder} ${g.firstName} ${g.lastName} — ${b.code} (${fmtDateS(b.date)} ${b.time} น.) ตอบภายใน ${expTxt}`);
  return r;
}
/* เรียกหลังทุกคำสั่ง + cron: ปิดคำขอที่หมดเวลา/ไม่จำเป็นแล้ว แล้วส่งคำขอถึงสำรองคนถัดไป (โหมดอัตโนมัติ) */
export function reserveTick(db) {
  if (!db.bookings.some(b => (b.rreq || []).length) && !reserveGuides(db).length) return 0;
  const s = RS(db), now = nowISO(), hasRes = reserveGuides(db).length > 0; let n = 0;
  db.bookings.forEach(b => {
    pendReq(b).forEach(r => {
      if (!needsReserve(b)) { r.st = 'cancelled'; r.endAt = now; n++ }
      else if (r.exp < now) { r.st = 'expired'; r.endAt = now; n++; log(db, 'reserve', `หมดเวลาตอบรับ — ${gName(db, r.gid)} · ${b.code}`) }
    });
    if (s.mode !== 'auto' || !hasRes || !needsReserve(b)) return;
    for (let k = missingG(b) - pendReq(b).length; k > 0; k--) {
      const g = nextReserve(db, b);
      if (!g) {
        if (!pendReq(b).length && !b.rempty) { b.rempty = true; if (s.notifyEmpty) notifyManagers(db, '⚠️ ไกด์สำรองหมดแล้ว', `${b.code} · ${fmtDateS(b.date)} ${b.time} น. · ${b.people} คน — ยังขาดไกด์ ${missingG(b)} คน กรุณาเลือกไกด์เองหรือติดต่อลูกค้า`, b.id); log(db, 'reserve', `ไกด์สำรองหมด — ${b.code} ยังขาดไกด์ ${missingG(b)} คน`) }
        break;
      }
      askReserve(db, b, g); n++;
    }
  });
  return n;
}
const reruns = (db, L) => { const k = L.filter(b => b.status !== 'cancelled' && b.qn != null && !isLocked(b)).map(qKey).sort(); return k.length ? rerunFrom(db, k[0]) : [] };

/* ===== ชำระเงิน ===== */
function paypalCharge(db, total) {
  const c = db.settings.channels.paypal; if (!c.passFee) return { charge: total, fee: 0 };
  const charge = Math.ceil((total + (+c.feeFixed || 0)) / (1 - (+c.feePct || 0) / 100)); return { charge, fee: charge - total };
}
function confirmPayment(db, b, how) {
  b.status = 'paid'; b.paidConfirmedBy = db.$actor?.name || 'ระบบอัตโนมัติ'; b.paidConfirmedAt = nowISO();
  const g = assignOnPay(db, b);
  notifyCustomer(db, b, 'confirmed');
  if (missingG(b)) notifyManagers(db, '⚠️ มีงานที่ยังไม่มีไกด์', `${b.code} · ${fmtDateS(b.date)} ${b.time} น. · ${b.people} คน${g ? ` · ยังขาดไกด์ ${missingG(b)} คน` : ''}`, b.id);
  log(db, 'confirm_payment', `${how} ${b.code} ${baht(b.paidAmount || b.total)}${b.payFee ? ` (รวมค่าธรรมเนียม PayPal ${baht(b.payFee)})` : ''} → ${g ? 'ไกด์ ' + gNames(db, b) : '(ยังไม่มีไกด์ว่าง)'}${missingG(b) && g ? ` (ยังขาดไกด์ ${missingG(b)} คน)` : ''}`);
  return g;
}
export function expirePending(db) {
  const now = nowISO(); let n = 0;
  db.bookings.forEach(b => {
    if (b.status === 'pending' && !b.slip && b.expiresAt && b.expiresAt < now) {
      b.status = 'cancelled'; b.cancelReason = 'หมดเวลาชำระเงิน'; b.expired = true; b.cancelledAt = now; n++;
      log(db, 'cancel', `หมดเวลาชำระเงิน ${b.code} (${fmtDateS(b.date)} ${b.time} น.) — ไม่ชำระภายใน ${db.settings.payDeadlineMin} นาที · คืนรอบให้ว่างแล้ว`);
    }
  });
  return n;
}
export function sendReminders(db) {
  const d = bkk(); if (d.getUTCHours() < 18) return 0; const t = today(); if (db.lastReminder === t) return 0;
  db.lastReminder = t; const tm = addDays(t, 1); let n = 0;
  db.bookings.filter(b => b.date === tm && b.status === 'paid' && b.trip === 'assigned' && b.guideId).forEach(b => gIds(b).forEach(id => { const g = gObj(db, id); if (g) { notifyGuide(db, g, b, 'remind'); n++ } }));
  return n;
}

/* ===== มุมมองข้อมูลที่ส่งให้ client ===== */
/* ===== ตรวจสลิป: QR บนสลิปโอนเงิน (Slip Verify Mini-QR ตามมาตรฐานธนาคาร) ===== */
const tlvList = s => { const out = []; let i = 0; while (i < s.length) { const t = s.slice(i, i + 2), l = s.slice(i + 2, i + 4); if (!/^\d{2}$/.test(t) || !/^\d{2}$/.test(l)) return null; const v = s.slice(i + 4, i + 4 + +l); if (v.length !== +l) return null; out.push([t, v]); i += 4 + +l } return out };
const crc16 = s => { let c = 0xFFFF; for (let i = 0; i < s.length; i++) { c ^= s.charCodeAt(i) << 8; for (let j = 0; j < 8; j++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xFFFF : (c << 1) & 0xFFFF } return c.toString(16).toUpperCase().padStart(4, '0') };
export const BANKS = { '002': 'กรุงเทพ', '004': 'กสิกรไทย', '006': 'กรุงไทย', '011': 'ทหารไทยธนชาต', '014': 'ไทยพาณิชย์', '022': 'ซีไอเอ็มบี', '024': 'ยูโอบี', '025': 'กรุงศรี', '030': 'ออมสิน', '033': 'ธอส.', '034': 'ธ.ก.ส.', '065': 'ธนชาต', '066': 'อิสลาม', '067': 'ทิสโก้', '069': 'เกียรตินาคินภัทร', '070': 'ไอซีบีซี', '071': 'ไทยเครดิต', '073': 'แลนด์ แอนด์ เฮ้าส์' };
/** คืน {kind:'bank'|'truemoney', bank, ref} ถ้าเป็น QR สลิปโอนเงินจริงตามโครงสร้าง + checksum, ไม่ใช่ → null */
export function parseSlipQr(raw) {
  const s = String(raw || '').trim(); if (s.length < 20 || s.length > 512) return null;
  const top = tlvList(s); if (!top || top.length < 2 || top[0][0] !== '00' || top[top.length - 1][0] !== '91') return null;
  const T = Object.fromEntries(top), crc = T['91']; if (!/^[0-9a-fA-F]{1,4}$/.test(crc)) return null;
  const body = s.slice(0, s.length - crc.length - 4), want = crc.toUpperCase().padStart(4, '0');
  if (crc16(body + '9104') !== want && crc16(body + '91' + String(crc.length).padStart(2, '0')) !== want) return null;
  const sub = tlvList(T['00']); if (!sub) return null; const S = Object.fromEntries(sub);
  if (S['00'] === '01' && S['01'] === '01') { const ref = S['03'] || ''; return ref.length >= 6 ? { kind: 'truemoney', bank: 'TrueMoney', ref } : null }
  if (S['00'] !== undefined && S['00'] !== '000001') return null;
  if (T['51'] !== 'TH') return null;
  const ref = S['02'] || ''; if (ref.length < 10) return null;
  return { kind: 'bank', bank: S['01'] || '', ref };
}
const SLIP_QR_CH = ['bank', 'promptpay']; // ช่องทางที่ต้องเป็นสลิปธนาคารที่มี QR
const slipRefOf = x => x.slipRef || parseSlipQr(x.slipQr)?.ref || '';
/* บัญชีผู้รับในสลิป (ปิดบางหลัก เช่น xxx-x-x4197-x, 12xxxx3456, 08xxxxxx42) ตรงกับบัญชีของเราไหม: true/false, null = ไม่มีข้อมูล */
function maskFits(mask, num) {
  const m = String(mask || '').replace(/[^0-9xX*]/g, '').replace(/[X*]/g, 'x'); if (!/\d/.test(m)) return null;
  if (m.length === num.length) return [...m].every((c, i) => c === 'x' || c === num[i]);
  const lead = m.match(/^\d+/)?.[0] || '', tail = m.match(/\d+$/)?.[0] || '', mids = (m.match(/\d+/g) || []).filter(x => x !== lead && x !== tail && x.length >= 3);
  if (lead && !num.startsWith(lead)) return false; if (tail && !num.endsWith(tail)) return false;
  return mids.every(x => num.includes(x));
}
function recvMatch(db, vals) {
  const c = db.settings.channels, ours = [];
  [c.bank?.accountNo, c.promptpay?.id, c.truemoney?.phone].map(x => String(x || '').replace(/\D/g, '')).filter(Boolean).forEach(n => { ours.push(n); if (/^0\d{9}$/.test(n)) ours.push('66' + n.slice(1), '0066' + n.slice(1)) });
  const res = (vals || []).map(v => ours.map(n => maskFits(v, n))).filter(r => r.some(x => x !== null));
  if (!res.length) return null; return res.some(r => r.some(x => x === true));
}
const NOT_SLIP = 'รูปนี้ไม่ใช่สลิปโอนเงิน (ไม่พบ QR ตรวจสอบสลิปของธนาคาร) — กรุณาแนบสลิปที่บันทึกจากแอปธนาคาร แบบเต็มใบ ไม่ครอป ให้เห็น QR มุมสลิปชัดเจน';
function slipValidate(db, p) {
  const code = String(p.code || '').trim().toUpperCase(), phone = String(p.phone || '').replace(/\D/g, '');
  const b = db.bookings.find(x => (x.id === p.id || x.code === code) && x.phone === phone) || fail('ไม่พบการจอง');
  if (b.status === 'cancelled' && (b.expired || b.cancelReason === 'หมดเวลาชำระเงิน')) fail('หมดเวลาชำระเงินแล้ว — ระบบคืนรอบนี้ให้ว่างแล้ว กรุณาจองใหม่ (หากโอนเงินไปแล้ว กรุณาติดต่อเจ้าหน้าที่)');
  if (b.status !== 'pending') fail('รายการนี้ไม่อยู่ในสถานะรอชำระ');
  const ch = db.settings.channels[p.channel]; if (!ch?.on) fail('ช่องทางชำระเงินไม่ถูกต้อง');
  const qr = String(p.qr || '').trim().slice(0, 512), hash = String(p.hash || '').slice(0, 64), info = parseSlipQr(qr);
  if (SLIP_QR_CH.includes(p.channel) && db.settings.slipStrict !== false && !info) fail(NOT_SLIP);
  const ref = info?.ref || '';
  const dup = db.bookings.find(x => x !== b && x.slip && ((ref && slipRefOf(x) === ref) || (qr && x.slipQr === qr) || (hash && x.slipHash === hash)));
  if (dup) fail(`สลิปนี้เคยถูกใช้แล้วกับการจอง ${dup.code} — กรุณาแนบสลิปของการโอนครั้งนี้ (หากเข้าใจผิด กรุณาติดต่อเจ้าหน้าที่)`);
  return { b, ch, qr, hash, info, ref };
}
const PUBLIC_CH = { bank: ['on', 'mode', 'bankName', 'accountName', 'accountNo'], promptpay: ['on', 'mode', 'id', 'name'], paypal: ['on', 'mode', 'email', 'me', 'passFee', 'feePct', 'feeFixed'], alipay: ['on', 'mode', 'accountId', 'name', 'image'], truemoney: ['on', 'mode', 'phone', 'name', 'image'] };
export function publicState(db) {
  const s = db.settings, ch = {};
  for (const [k, f] of Object.entries(PUBLIC_CH)) { if (s.channels[k]?.on) { ch[k] = {}; f.forEach(x => ch[k][x] = s.channels[k][x]) } else ch[k] = { on: false } }
  return {
    settings: { groupFee: s.groupFee, entryRates: s.entryRates, maxGroup: s.maxGroup, payDeadlineMin: s.payDeadlineMin, slotStart: s.slotStart, slotEnd: s.slotEnd, slotStep: s.slotStep, rules: s.rules || '', receipt: s.receipt || {}, slipStrict: s.slipStrict !== false, vehicleFee: +(s.vehicleFee ?? 30), motoFee: +(s.motoFee ?? 20), extraGuideFee: +(s.extraGuideFee ?? s.split?.guide ?? 700), maxGuides: MAX_GUIDES, bookAheadDays: s.bookAheadDays, minLead: s.minLead, seasons: (s.seasons || []).filter(x => x.active), channels: ch },
    site: db.site, guideCount: activeGuides(db).length, today: today(),
  };
}
export function bookingView(b) {
  if (!b) return null;
  const k = ['id', 'code', 'date', 'time', 'people', 'pax', 'groupFee', 'entryTotal', 'entryRates', 'paidConfirmedAt', 'vehicles', 'vehicleFee', 'motos', 'motoFee', 'vehicleTotal', 'guidesNeeded', 'extraGuideFee', 'extraGuideTotal', 'total', 'status', 'expiresAt', 'payChannel', 'paidAmount', 'payFee', 'cancelReason', 'expired', 'name', 'createdAt'];
  const o = {}; k.forEach(x => o[x] = b[x]); o.slip = !!b.slip; if (b.refund) o.refund = { amt: b.refund.amt, st: b.refund.st, date: b.refund.date || null }; o.phone = b.phone.replace(/^(\d{3})\d+(\d{3})$/, '$1xxxx$2'); if (b.email) o.email = b.email.replace(/^(.{2})[^@]*(@.*)$/, '$1***$2'); return o;
}
const safeUser = u => ({ id: u.id, no: u.no || null, username: u.username, name: u.name, email: u.email || '', phone: u.phone || '', role: u.role, guideId: u.guideId || null, active: u.active });
export function adminState(db, actor) {
  const base = { settings: db.settings, site: db.site, rotSeq: db.rotSeq, lastGuideId: db.lastGuideId, me: safeUser(actor), today: today(), notifSeenAt: db.users.find(u => u.id === actor.id)?.notifSeenAt || '' };
  if (actor.role === 'guide') {
    return {
      ...base, settings: { ...db.settings, channels: {}, villageAcct: {}, acct: undefined }, site: undefined,
      guides: db.guides.filter(g => g.id === actor.guideId), users: [],
      coGuides: [...new Set(db.bookings.filter(b => hasGuide(b, actor.guideId) && b.status !== 'cancelled').flatMap(gIds))].filter(id => id !== actor.guideId)
        .map(id => gObj(db, id)).filter(Boolean).map(g => ({ id: g.id, firstName: g.firstName, lastName: g.lastName, phone: g.phone || '' })), // ไกด์ร่วมงาน (กลุ่มใหญ่ 2 ไกด์)
      unavail: db.unavail.filter(u => u.guideId === actor.guideId),
      bookings: db.bookings.filter(b => hasGuide(b, actor.guideId) && b.status !== 'cancelled'), audit: [],
      reqs: db.bookings.filter(b => pendReq(b).some(r => r.gid === actor.guideId)).map(b => { const r = pendReq(b).find(x => x.gid === actor.guideId); return { id: b.id, code: b.code, date: b.date, time: b.time, people: b.people, two: needG(b) > 1, fee: slotFee(b), exp: r.exp, at: r.at } }), // คำขอเปิดใช้ไกด์สำรองที่รอตอบ
      notifications: db.notifications.filter(n => n.guideId === actor.guideId && n.channel === 'push').slice(0, 100).map(n => ({ id: n.id, at: n.at, title: n.title, body: n.body, message: n.message, kind: n.kind || '', from: n.fromName || '', url: n.url || '' })),
    };
  }
  return {
    ...base, guides: db.guides, users: db.users.map(safeUser), unavail: db.unavail, bookings: db.bookings,
    audit: db.audit, notifications: db.notifications,
    acct: can(actor, 'acctView') ? { ...(db.acct || { on: false }), preview: db.acct?.on ? null : openPreview(db) } : null, // สมุดบัญชี: ยอดกระเป๋า (รายการดึงแยกที่ /api/admin/ledger)
  };
}

/* ===== คำสั่งจากหน้าเว็บสาธารณะ ===== */
export const publicActions = {
  availability(db, p) { return availability(db, p.date, +p.people || 1) },
  createBooking(db, p) {
    const s = db.settings, pax = { ta: +p.pax?.ta || 0, tc: 0, fa: +p.pax?.fa || 0, fc: 0 } /* ยกเลิกประเภทเด็กแล้ว */, people = paxCount(pax);
    if (people < 1 || people > s.maxGroup * MAX_GUIDES) fail(`จำนวนคนต้องอยู่ระหว่าง 1–${s.maxGroup * MAX_GUIDES} คน`);
    const gn = guidesFor(s, people), xFee = +(s.extraGuideFee ?? s.split?.guide ?? 700), xTotal = (gn - 1) * xFee; // เกิน maxGroup คน → เพิ่มไกด์ + ค่าไกด์เพิ่ม
    if (Object.values(pax).some(v => v < 0 || !Number.isInteger(v))) fail('จำนวนคนไม่ถูกต้อง');
    const name = String(p.name || '').trim().slice(0, 120), phone = String(p.phone || '').replace(/\D/g, '');
    if (!name) fail('กรุณากรอกชื่อ-นามสกุล');
    if (!/^0\d{8,9}$/.test(phone) && !/^\d{8,15}$/.test(phone)) fail('กรุณากรอกเบอร์โทรให้ถูกต้อง');
    const email = String(p.email || '').trim().slice(0, 120);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) fail('กรุณากรอกอีเมลให้ถูกต้อง');
    if ((s.rules || '').trim() && !p.acceptRules) fail('กรุณาอ่านและยอมรับกฎระเบียบก่อนจอง');
    if (!slotList(db).includes(p.time)) fail('กรุณาเลือกเวลาออกเดินทาง');
    // กันส่งซ้ำ (กดซ้ำ/เน็ตหลุดแล้วส่งใหม่): คำขอเดิม (nonce เดิม) → คืนการจองเดิม ไม่สร้างใหม่
    const nonce = String(p.nonce || '').replace(/[^\w-]/g, '').slice(0, 40);
    if (nonce) { const prev = db.bookings.find(b => b.nonce === nonce && b.phone === phone); if (prev) return { booking: bookingView(prev), repeat: true } }
    // กันจองซ้ำ: เบอร์หรืออีเมลเดียวกันมีการจองที่ยังใช้งานอยู่ในวันเดียวกัน → ถามยืนยันก่อน (จองหลายกลุ่มได้ถ้ายืนยัน)
    const em = email.toLowerCase(), live = b => b.status === 'pending' || (b.status === 'paid' && b.trip !== 'paidcancel');
    const same = db.bookings.filter(b => live(b) && b.date === p.date && (b.phone === phone || (b.email || '').toLowerCase() === em));
    if (same.length && !p.allowDup) {
      const x = same.find(b => b.time === p.time) || same[0], mine = x.phone === phone && (x.email || '').toLowerCase() === em, sameTime = x.time === p.time;
      throw new UserError(sameTime ? `เบอร์โทร/อีเมลนี้มีการจองรอบ ${fmtDate(p.date)} ${p.time} น. อยู่แล้ว` : `เบอร์โทร/อีเมลนี้มีการจองวันที่ ${fmtDate(p.date)} อยู่แล้ว (รอบ ${x.time} น.)`, 409,
        { dup: { sameTime, time: x.time, people: x.people, status: x.status === 'paid' ? 'paid' : x.slip ? 'review' : 'pending', count: same.length, ...(mine ? { code: x.code } : {}) } });
    }
    const av = availability(db, p.date, people);
    if (av.closed) fail(`วันนี้ปิดรับจอง: ${av.closed.name}`);
    if (av.tooFar) fail(`จองล่วงหน้าได้ไม่เกิน ${s.bookAheadDays} วัน`);
    const sl = av.slots.find(x => x.t === p.time);
    if (!sl || sl.reason === 'lead') fail('รอบนี้ต้องจองล่วงหน้ามากกว่านี้ กรุณาเลือกรอบอื่น');
    if (sl.free <= 0) fail(/^ไกด์ว่างไม่พอ/.test(sl.reason) ? `รอบนี้มีไกด์ว่างไม่พอสำหรับกลุ่ม ${people} คน (ต้องใช้ไกด์ ${gn} คน) กรุณาเลือกรอบอื่น` : 'รอบนี้เต็มแล้ว กรุณาเลือกรอบอื่น');
    if (db.bookings.filter(b => b.phone === phone && b.status === 'pending').length >= 3) fail('เบอร์นี้มีการจองที่รอชำระอยู่หลายรายการ กรุณาชำระหรือรอให้หมดเวลาก่อน');
    const vehicles = Math.max(0, Math.min(10, Math.floor(+p.vehicles || 0))), vehicleFee = +(s.vehicleFee ?? 30), motos = Math.max(0, Math.min(10, Math.floor(+p.motos || 0))), motoFee = +(s.motoFee ?? 20), vehicleTotal = vehicles * vehicleFee + motos * motoFee; // ค่ารถรวม (รถยนต์ + จักรยานยนต์)
    if (vehicles + motos > people) fail(`จำนวนรถยนต์และรถจักรยานยนต์รวมกันต้องไม่เกินจำนวนผู้เดินป่า (${people} คน)`);
    const entryTotal = entryOf(pax, s.entryRates), created = nowISO();
    const b = {
      id: uid(), code: 'PG' + (++db.seq), qn: null, date: p.date, time: p.time, people, pax, entryRates: { ...s.entryRates },
      name, phone, email, rulesAccepted: !!(s.rules || '').trim(), line: String(p.line || '').trim().slice(0, 60), note: String(p.note || '').trim().slice(0, 500),
      groupFee: +s.groupFee, entryTotal, vehicles, vehicleFee, motos, motoFee, vehicleTotal, guidesNeeded: gn, extraGuideFee: gn > 1 ? xFee : 0, extraGuideTotal: xTotal,
      total: +s.groupFee + xTotal + entryTotal + vehicleTotal, split: { ...s.split, ...(gn > 1 ? { guide2: xFee } : {}) },
      status: 'pending', slip: null, paidConfirmedBy: null, paidConfirmedAt: null, guideId: null, trip: 'unassigned', startedAt: null, endedAt: null,
      nonce: nonce || null, payout: { paid: false }, createdAt: created, expiresAt: new Date(Date.parse(created) + (+s.payDeadlineMin || 30) * 60e3).toISOString(),
    };
    db.bookings.push(b);
    db.$actor = { id: '-', name: 'ลูกค้า (' + name + ')', role: 'public' };
    log(db, 'booking', `จองใหม่ ${b.code} ${fmtDate(b.date)} ${b.time} · ${people} คน${gn > 1 ? ` (ไกด์ ${gn} คน +${baht(xTotal)})` : ''} · ${baht(b.total)}${same.length ? ` (ยืนยันจองเพิ่ม — เบอร์/อีเมลนี้มีการจองวันเดียวกันอยู่แล้ว ${same.length} รายการ)` : ''}`);
    return { booking: bookingView(b) };
  },
  lookup(db, p) {
    const code = String(p.code || '').trim().toUpperCase(), phone = String(p.phone || '').replace(/\D/g, '');
    const b = db.bookings.find(x => x.code === code && x.phone === phone);
    if (!b) fail('ไม่พบการจอง ตรวจสอบรหัสและเบอร์โทร');
    return { booking: bookingView(b) };
  },
  slipCheck(db, p) { slipValidate(db, p); return { ok: true } }, // ตรวจก่อนอัปโหลด (เรียกจาก worker เท่านั้น)
  slip(db, p) { // p: {code, phone, channel, url, qr, hash, verify} — url ได้จากการอัปโหลดเข้า R2 แล้ว
    const { b, ch, qr, hash, info, ref } = slipValidate(db, p);
    const v0 = p.verify || null, need0 = p.channel === 'paypal' ? paypalCharge(db, b.total).charge : b.total;
    if (v0?.ok && +v0.amount > 0 && +v0.amount < need0) fail(`ยอดเงินในสลิป ${baht(v0.amount)} ไม่ตรงกับยอดที่ต้องชำระ ${baht(need0)} — กรุณาแนบสลิปที่ถูกต้อง หรือติดต่อเจ้าหน้าที่`);
    b.slip = p.url; b.payChannel = p.channel; b.slipQr = qr || null; b.slipHash = hash || null; b.slipAt = nowISO(); b.slipRef = ref || null; b.slipBank = info ? (BANKS[info.bank] || info.bank) : null;
    if (p.channel === 'paypal') { const x = paypalCharge(db, b.total); b.paidAmount = x.charge; b.payFee = x.fee } else { b.paidAmount = b.total; b.payFee = 0 }
    db.$actor = { id: '-', name: 'ลูกค้า (' + b.name + ')', role: 'public' };
    log(db, 'slip', `แนบหลักฐานการชำระ ${b.code} ผ่าน ${p.channel}${info ? ` (QR สลิปถูกต้อง · ${b.slipBank || '-'} · ref ${ref})` : qr ? ' (QR ไม่ใช่สลิปธนาคาร — ตรวจด้วยตา)' : ' (ไม่มี QR สลิป — ตรวจด้วยตา)'}`);
    // ออโต้: ตรวจสลิปกับผู้ให้บริการ (SlipOK) ผ่าน → ยืนยันทันที / ไม่ผ่านหรือยังไม่เชื่อม → รอเจ้าหน้าที่
    const v = p.verify || null, need = b.paidAmount || b.total;
    const tOld = v?.ok && v.time && Date.parse(v.time) < Date.parse(b.createdAt) - 10 * 60e3, rOk = v?.ok ? recvMatch(db, v.recv) : null;
    b.slipVerify = v ? { ok: !!v.ok, provider: String(v.provider || 'SlipOK').slice(0, 20), amount: +v.amount || 0, ref: String(v.ref || '').slice(0, 80), msg: String(v.msg || '').slice(0, 200), at: nowISO(), time: v.time || null, recvOk: rOk, recv: (v.recv || []).filter(Boolean).join(' / ').slice(0, 80), recvName: String(v.recvName || '').slice(0, 80), old: !!tOld, dup: !!v.dup, notFound: !!v.notFound } : null;
    if (ch.mode === 'auto' && v?.ok && !v.dup && +v.amount >= need && rOk !== false && !tOld) {
      db.$actor = { id: 'auto', name: 'ระบบอัตโนมัติ (ตรวจสลิป)', role: 'system' };
      confirmPayment(db, b, 'ยืนยันอัตโนมัติ (สลิปผ่านการตรวจ)');
      return { booking: bookingView(b), verified: true };
    }
    notifyCustomer(db, b, 'slip');
    return { booking: bookingView(b), verified: false, verifyMsg: v && !v.ok ? b.slipVerify.msg : '' };
  },
};

/* ===== บัญชี: สมุดรายวัน (บัญชีคู่ แสดงผลเป็น "กระเป๋าเงิน") =====
   กระเป๋า: bank เงินในบัญชีรับชำระ · dep เงินรับล่วงหน้า · gd ค้างจ่ายไกด์ · vil ค้างโอนหมู่บ้าน · park ค้างนำส่งอุทยาน · ref ค้างคืนลูกค้า · fund กองทุนดำเนินงาน
   กฎ: ทุกรายการต้องสมดุล (ธนาคารเปลี่ยนเท่ากับผลรวมกระเป๋าอื่นที่เปลี่ยน) → ธนาคาร = ผลรวมกระเป๋าอื่น เสมอ
   รายการที่บันทึกแล้วลบไม่ได้ ผิด → "กลับรายการ" · รายการจากการจองลงอัตโนมัติด้วย ledgerSync:
   เทียบ "ข้อเท็จจริง" ของการจองตอนนี้ (factsOf) กับที่ลงไว้แล้ว (b.lk) → ลงส่วนที่เพิ่ม / กลับรายการส่วนที่หายไปหรือเปลี่ยน */
export const WAL = ['bank', 'dep', 'gd', 'vil', 'park', 'ref', 'fund'];
const SIGN_ROLES = ['ผู้จัดทำ', 'ผู้ตรวจสอบ', 'ประธาน'];
export const AS = db => ({
  start: '2026-12-01', bankLabel: '',
  cats: ['ค่าธรรมเนียมธนาคาร', 'ค่าตรวจสลิป EasySlip', 'ค่าเว็บไซต์/ระบบ', 'อุปกรณ์/ปฐมพยาบาล', 'อบรมไกด์', 'อื่นๆ'],
  icats: ['เงินบริจาค', 'ดอกเบี้ยธนาคาร', 'อื่นๆ'],
  signers: SIGN_ROLES.map(role => ({ role, name: '', pos: '' })), ...(db.settings.acct || {}),
});
const r2 = x => Math.round((+x || 0) * 100) / 100;
const ymOf = d => String(+d.slice(0, 4) + 543).slice(2) + d.slice(5, 7);
const clean = L => { const o = {}; for (const w of WAL) { const v = r2(L?.[w]); if (v) o[w] = v } return o };
const sameL = (a, b) => { a = clean(a); b = clean(b); return WAL.every(w => (a[w] || 0) === (b[w] || 0)) };
const negL = L => Object.fromEntries(Object.entries(clean(L)).map(([k, v]) => [k, -v]));
const addL = (a, b) => { const o = { ...a }; for (const [k, v] of Object.entries(clean(b))) o[k] = r2((o[k] || 0) + v); return clean(o) };
const balanced = L => { L = clean(L); return Math.abs((L.bank || 0) - WAL.slice(1).reduce((s, w) => s + (L[w] || 0), 0)) < 0.005 };
/* ค่าอุทยานของกลุ่มที่ลูกค้าไม่มา/ยกเลิก: ค่าเข้า + ค่ารถ "รอถามอุทยาน" ก่อน (b.phold: 'park' นำส่งตามปกติ · 'fund' ไม่ต้องนำส่ง → กองทุน) */
const holdAmt = b => ['noshow', 'paidcancel'].includes(b.trip) ? (+b.entryTotal || 0) + (+b.vehicleTotal || 0) : 0;
const parkWait = b => holdAmt(b) > 0 && !b.phold;
const parkDue = b => r2((+b.split?.park || 0) + (b.phold === 'fund' ? 0 : (+b.entryTotal || 0) + (+b.vehicleTotal || 0)));
const parkOpen = b => b.status === 'paid' && isDone(b) && !!b.lk?.done && !b.ppay; // จบงานหลังเปิดใช้สมุด และยังไม่นำส่ง
const vilDue = b => b.refund ? (b.refund.keep === 'vil' ? r2(b.refund.keepAmt) : 0) : (b.status === 'paid' && isDone(b) ? +b.split?.village || 0 : 0); // ส่วนกลางหมู่บ้านที่ต้องโอน
function factsOf(b) {
  const F = {}; if (b.status !== 'paid' && !b.refund) return F;
  const T = +b.total || 0; F.pay = { bank: T, dep: T };
  if (b.refund) { // ยกเลิกและคืนเงิน: รับล่วงหน้า → ค้างคืนลูกค้า (+ ส่วนที่ไม่คืน → หมู่บ้าน/กองทุน) · โอนคืนแล้ว → ธนาคารลด
    const R = r2(b.refund.amt), K = r2(T - R), kw = b.refund.keep === 'vil' ? 'vil' : 'fund';
    F.rfa = { dep: -T, ref: R, [kw]: K };
    if (b.refund.st === 'paid') F.rfp = { ref: -R, bank: -R };
    if (kw === 'vil' && K && b.vpay?.paid) F.vil = { vil: -K, bank: -K };
    return F;
  }
  if (!isDone(b)) return F;
  const g1 = b.guideId ? +b.split?.guide || 0 : 0, g2 = needG(b) > 1 && b.guide2Id ? +b.split?.guide2 || 0 : 0; // ตำแหน่งไกด์ที่ไม่มีคน → กองทุน
  const V = +b.split?.village || 0, P = (+b.split?.park || 0) + (+b.entryTotal || 0) + (+b.vehicleTotal || 0);
  F.done = { dep: -T, gd: g1 + g2, vil: V, park: P, fund: r2(T - g1 - g2 - V - P) };
  if (b.payout?.paid && g1) F.g1 = { gd: -g1, bank: -g1 };
  if (b.payout2?.paid && g2) F.g2 = { gd: -g2, bank: -g2 };
  if (b.vpay?.paid && V) F.vil = { vil: -V, bank: -V };
  const h = holdAmt(b); if (b.phold === 'fund' && h) F.hfund = { park: -h, fund: h };
  return F;
}
const KLAB = { pay: 'รับชำระ', done: 'จบงาน', g1: 'จ่ายไกด์', g2: 'จ่ายไกด์คนที่ 2', vil: 'โอนหมู่บ้าน', hfund: 'ค่าอุทยานเข้ากองทุน', rfa: 'อนุมัติคืนเงิน', rfp: 'โอนคืนเงิน' };
const KTYPE = { pay: 'pay', done: 'done', g1: 'gpay', g2: 'gpay', vil: 'vpay', hfund: 'hold', rfa: 'rfa', rfp: 'rfp' };
export const ymNow = () => today().slice(0, 7);
/* ยอดสิ้นเดือน (ตามวันที่ของรายการ) ของทุกกระเป๋า — จาก acct.mon (ผลรวมการเปลี่ยนแปลงรายเดือน) */
export const walEnd = (A, ym) => { const o = Object.fromEntries(WAL.map(w => [w, 0])); for (const [m, d] of Object.entries(A?.mon || {})) if (m <= ym) WAL.forEach(w => o[w] = r2(o[w] + (d[w] || 0))); return o };
const CH_LAB = { bank: 'โอนบัญชี', promptpay: 'พร้อมเพย์', paypal: 'PayPal', alipay: 'Alipay', truemoney: 'TrueMoney' };
function post(db, e) {
  const A = db.acct, L = clean(e.lines); if (!Object.keys(L).length) return null;
  if (!balanced(L)) throw new Error('ledger unbalanced ' + JSON.stringify(L));
  const date = e.date || today(), ym = ymOf(date), mk = date.slice(0, 7);
  if (A.per?.[mk]?.closed) throw new UserError(`งวด ${mk} ปิดแล้ว — บันทึกเป็นรายการปรับปรุงในเดือนปัจจุบันแทน`);
  A.seq[ym] = (A.seq[ym] || 0) + 1; A.n = (A.n || 0) + 1;
  const a = db.$actor || {};
  const row = { no: `JV-${ym}-${String(A.seq[ym]).padStart(4, '0')}`, date, at: nowISO(), type: e.type, desc: e.desc || '', ref: e.ref || '', bids: e.bids || [], lines: L, by: a.name || 'ระบบ', byId: a.id || '-', auto: !!e.auto };
  for (const k of ['proof', 'note', 'cat', 'party', 'revOf', 'of', 'meta']) if (e[k] != null && e[k] !== '') row[k] = e[k];
  for (const w of WAL) A.bal[w] = r2((A.bal[w] || 0) + (L[w] || 0));
  const M = ((A.mon ||= {})[mk] ||= {}); for (const w of Object.keys(L)) M[w] = r2((M[w] || 0) + L[w]);
  (db.$ledger ||= []).push(row); return row;
}
function factEntry(db, k, b, g) {
  const how = { completed: 'จบงาน', noshow: 'ลูกค้าไม่มา', paidcancel: 'ลูกค้ายกเลิก (ไม่คืนเงิน)' }[b.trip] || 'จบงาน', l = g.lines;
  if (k === 'pay') return { type: 'pay', ref: b.code, proof: b.slip || '', desc: `รับชำระ ${b.code} · ${b.people} คน · เดิน ${fmtDateS(b.date)} ${b.time}${b.payChannel ? ' · ' + (CH_LAB[b.payChannel] || b.payChannel) : ''}` };
  if (k === 'done') return { type: 'done', ref: b.code, desc: `${how} ${b.code} → ไกด์ ${baht(l.gd || 0)} · หมู่บ้าน ${baht(l.vil || 0)} · อุทยาน ${baht(l.park || 0)}${l.fund ? ` · กองทุน ${baht(l.fund)}` : ''}` };
  if (k === 'g1' || k === 'g2') { const po = k === 'g1' ? b.payout : b.payout2; return { type: 'gpay', ref: b.code, note: po?.ref ? 'อ้างอิงการโอน ' + po.ref : '', desc: `จ่ายค่าไกด์ ${gName(db, k === 'g1' ? b.guideId : b.guide2Id)} · ${b.code}${k === 'g2' ? ' (ไกด์คนที่ 2)' : ''}` } }
  if (k === 'vil') return { type: 'vpay', ref: b.vpay?.ref || '', desc: `โอนส่วนกลางหมู่บ้าน ${g.codes.length} กลุ่ม (${g.codes.slice(0, 6).join(', ')}${g.codes.length > 6 ? ' …' : ''})`, meta: { codes: g.codes.slice(0, 300) } };
  if (k === 'rfa') { const K = r2((+b.total || 0) - r2(b.refund.amt)); return { type: 'rfa', ref: b.code, note: b.refund.reason || '', desc: `ยกเลิกและคืนเงิน ${b.code} (${b.name}) — คืน ${baht(b.refund.amt)}${K ? ` · ส่วนที่ไม่คืน ${baht(K)} → ${b.refund.keep === 'vil' ? 'ส่วนกลางหมู่บ้าน' : 'กองทุนดำเนินงาน'}` : ''}` } }
  if (k === 'rfp') return { type: 'rfp', ref: b.code, proof: b.refund.proof || '', note: [b.refund.date ? 'โอนวันที่ ' + fmtDate(b.refund.date) : '', b.refund.ref ? 'อ้างอิง ' + b.refund.ref : ''].filter(Boolean).join(' · '), desc: `โอนคืนเงินลูกค้า ${b.code} (${b.name})` };
  return { type: 'hold', ref: b.code, desc: `ค่าเข้า/ค่ารถอุทยานที่ไม่ต้องนำส่ง ${b.code} → กองทุนดำเนินงาน` };
}
/* ลงรายการอัตโนมัติจากสถานะการจอง (เรียกหลังทุกคำสั่งใน engine.run) */
export function ledgerSync(db) {
  const A = db.acct; if (!A?.on) return 0;
  const G = new Map(), add = (key, o, b, k, l) => { let g = G.get(key); if (!g) G.set(key, g = { ...o, lines: {}, bids: [], codes: [], marks: [] }); g.lines = addL(g.lines, l); g.bids.push(b.id); g.codes.push(b.code); g.marks.push([b, k, clean(l)]) };
  for (const b of db.bookings) {
    const F = factsOf(b), lk = b.lk || {};
    for (const [k, v] of Object.entries(lk)) if (!F[k] || !sameL(F[k], v.l)) add(`r:${v.no}:${k}`, { rev: true, k, revOf: v.no }, b, k, negL(v.l));
    for (const [k, l] of Object.entries(F)) if ((!lk[k] || !sameL(l, lk[k].l)) && Object.keys(clean(l)).length) add(k === 'vil' ? `vil:${b.vpay.batch || b.id}` : `${k}:${b.id}`, { k }, b, k, l);
  }
  const L = [...G.values()].filter(g => balanced(g.lines) || (console.error('ledgerSync unbalanced', g.k, g.codes), false)).sort((x, y) => (y.rev ? 1 : 0) - (x.rev ? 1 : 0)); // กลับรายการก่อน
  for (const g of L) {
    const b0 = g.marks[0][0];
    const e = g.rev ? { type: 'rev', revOf: g.revOf, of: KTYPE[g.k] || '', ref: g.codes.length === 1 ? b0.code : '', desc: `กลับรายการ ${KLAB[g.k] || g.k} ${g.codes.slice(0, 6).join(', ')}${g.codes.length > 6 ? ' …' : ''} (ของ ${g.revOf}) — ยกเลิกการยืนยัน/ข้อมูลการจองเปลี่ยน` } : factEntry(db, g.k, b0, g);
    const row = post(db, { ...e, lines: g.lines, bids: g.bids, auto: true }); if (!row) continue;
    for (const [b, k, l] of g.marks) { b.lk = b.lk || {}; if (g.rev) { if (b.lk[k]?.no === g.revOf) delete b.lk[k] } else b.lk[k] = { no: row.no, l } }
    if (g.rev && g.revOf !== A.openNo) (db.$ledgerUpd ||= []).push({ no: g.revOf, revBy: row.no });
  }
  return L.length;
}
/* ตัวอย่างยอดยกมา (คำนวณจากสถานะการจองตอนนี้) */
export function openPreview(db) {
  const o = { dep: 0, gd: 0, vil: 0, ref: 0, parkAll: 0, paid: 0, done: 0 };
  for (const b of db.bookings) {
    const F = factsOf(b); if (!F.pay) continue; o.paid++; if (F.done) o.done++;
    for (const l of Object.values(F)) { o.dep += l.dep || 0; o.gd += l.gd || 0; o.vil += l.vil || 0; o.ref += l.ref || 0; o.parkAll += l.park || 0 }
  }
  for (const k of Object.keys(o)) o[k] = r2(o[k]); return o;
}
const acctOn = db => db.acct?.on || fail('ยังไม่ได้เปิดใช้สมุดบัญชี — ไปที่ บัญชี → ภาพรวมการเงิน');
const acctDate = (db, d) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d || '')) fail('กรุณาเลือกวันที่'); if (d > today()) fail('บันทึกวันที่ล่วงหน้าไม่ได้');
  if (d < db.acct.start) fail(`วันที่ต้องไม่ก่อนวันเริ่มใช้สมุดบัญชี (${fmtDate(db.acct.start)})`);
  if (db.acct.per?.[d.slice(0, 7)]?.closed) fail(`งวด ${d.slice(0, 7)} ปิดแล้ว — เลือกวันที่ในเดือนที่ยังไม่ปิด`); return d;
};
const proofOk = v => { const u = String(v || '').trim().slice(0, 200); if (u && !/^\/img\/acct\/[\w.-]+$/.test(u)) fail('ไฟล์หลักฐานไม่ถูกต้อง'); return u };

/* ===== คำสั่งหลังบ้าน (ต้องเข้าสู่ระบบ + ตรวจสิทธิ์) ===== */
const ownTrip = (db, b) => db.$actor.role === 'guide' && hasGuide(b, db.$actor.guideId);
const str = (v, n = 200) => String(v ?? '').trim().slice(0, n);
export const adminActions = {
  confirmPay(db, p) {
    need(db.$actor, 'confirmPay'); const b = byId(db, p.id);
    if (b.status !== 'pending') fail('รายการนี้ไม่อยู่ในสถานะรอชำระ');
    if (!b.paidAmount) b.paidAmount = b.total;
    const g = confirmPayment(db, b, 'ยืนยันรับเงิน (แมนนวล)');
    return { msg: g ? `ยืนยันแล้ว → ไกด์ ${gNames(db, b)}${missingG(b) ? ` (ยังขาดไกด์ ${missingG(b)} คน)` : ''}` : 'ยืนยันแล้ว แต่ยังไม่มีไกด์ว่าง' };
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
    b.trip = 'noshow'; b.endedAt = nowISO(); b.closeNote = 'แจ้งโดย ' + db.$actor.name; gIds(b).forEach(id => moveToLast(db, id));
    log(db, 'noshow', `ลูกค้าไม่มา ${b.code} — ไกด์ ${gNames(db, b)} ได้ค่าไกด์ตามปกติ · ย้ายไปลำดับสุดท้าย`);
    return { msg: 'บันทึกแล้ว — ส่งค่าไกด์ไปหน้าเบิกจ่าย และย้ายไกด์ไปต่อท้ายคิว' };
  },
  paidcancel(db, p) {
    need(db.$actor, 'cancel'); const b = byId(db, p.id);
    if (b.status !== 'paid' || isLocked({ ...b, manual: false })) fail('รายการนี้ยกเลิกไม่ได้');
    const G = gIds(b).map(id => gObj(db, id)).filter(Boolean); b.trip = 'paidcancel'; b.endedAt = nowISO(); b.closeNote = 'แจ้งโดย ' + db.$actor.name;
    G.forEach(g => { notifyGuide(db, g, b, 'paidcancel'); moveToLast(db, g.id) });
    log(db, 'paidcancel', `ลูกค้ายกเลิก ${b.code} (ไม่คืนเงิน) — ${G.length ? 'ไกด์ ' + gNames(db, b) + ' ได้ค่าไกด์ตามปกติ · ย้ายไปลำดับสุดท้าย' : 'ไม่มีไกด์ได้รับมอบหมาย'}`);
    return { msg: 'บันทึกการยกเลิกแล้ว' };
  },
  reschedule(db, p) {
    need(db.$actor, 'cancel'); const b = byId(db, p.id);
    if (b.status !== 'paid' || isLocked({ ...b, manual: false })) fail('เลื่อนวันได้เฉพาะงานที่ชำระแล้วและยังไม่เริ่มเดินทาง');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date || '') || !slotList(db).includes(p.time)) fail('กรุณาเลือกวันและเวลา');
    if (p.date < today()) fail('เลื่อนไปวันที่ผ่านมาแล้วไม่ได้');
    const od = b.date, ot = b.time; if (p.date === od && p.time === ot) return { msg: 'ไม่มีการเปลี่ยนแปลง' };
    const oldKey = qKey(b), oldIds = gIds(b), oldNames = gNames(db, b); b.date = p.date; b.time = p.time;
    if (b.manual && oldIds.some(id => guideBlocked(db, id, b.date, b.time, b.id, b))) b.manual = false;
    const ch = rerunFrom(db, [oldKey, qKey(b)].sort()[0]), mine = ch.find(c => c.b === b);
    oldIds.filter(id => hasGuide(b, id) && !(mine && !mine.old.includes(id))).forEach(id => { const g = gObj(db, id); if (g) notifyGuide(db, g, b, 'new') }); // ไกด์เดิม → แจ้งวันใหม่
    log(db, 'reschedule', `เลื่อน ${b.code} ${fmtDateS(od)} ${ot} → ${fmtDateS(b.date)} ${b.time} · ไกด์ ${oldNames} → ${b.guideId ? gNames(db, b) : 'รอมอบหมาย'}${ch.length > 1 ? ` (จัดคิวใหม่อีก ${ch.length - 1} งาน)` : ''}`);
    return { msg: 'เลื่อนวันแล้ว' };
  },
  tripStart(db, p) {
    const b = byId(db, p.id); if (!(can(db.$actor, 'tripAdmin') || ownTrip(db, b))) need(db.$actor, 'tripAdmin');
    if (b.status !== 'paid' || b.trip !== 'assigned') fail('เริ่มเดินทางได้เฉพาะงานที่ชำระแล้วและได้รับมอบหมาย');
    const photo = str(p.photo, 200); if (photo && !/^\/img\/trips\//.test(photo)) fail('รูปไม่ถูกต้อง');
    if (db.$actor.role === 'guide' && !photo) fail('กรุณาถ่ายรูปกลุ่มก่อนเริ่มเดินทาง');
    if (photo) b.startPhoto = photo;
    b.trip = 'started'; b.startedAt = nowISO(); b.startedBy = db.$actor.name; log(db, 'trip_start', `เริ่มเดินทาง ${b.code} (ไกด์ ${gNames(db, b)})`);
    return { msg: 'บันทึกเวลาเริ่มเดินทางแล้ว' };
  },
  tripEnd(db, p) {
    const b = byId(db, p.id); if (!(can(db.$actor, 'tripAdmin') || ownTrip(db, b))) need(db.$actor, 'tripAdmin');
    if (b.trip !== 'started') fail('ต้องเริ่มการเดินทางก่อน');
    const photo = str(p.photo, 200); if (photo && !/^\/img\/trips\//.test(photo)) fail('รูปไม่ถูกต้อง');
    if (db.$actor.role === 'guide' && !photo) fail('กรุณาถ่ายรูปกลุ่มก่อนสิ้นสุดการเดินทาง');
    if (photo) b.endPhoto = photo;
    b.trip = 'completed'; b.endedAt = nowISO(); log(db, 'trip_end', `สิ้นสุดเดินทาง ${b.code} (ไกด์ ${gNames(db, b)})`);
    return { msg: 'สิ้นสุดการเดินทางแล้ว' };
  },
  payGuide(db, p) { // slot 1 = ไกด์หลัก (split.guide) · slot 2 = ไกด์คนที่ 2 (split.guide2)
    need(db.$actor, 'payout'); const b = byId(db, p.id), two = +p.slot === 2, g = gObj(db, two ? b.guide2Id : b.guideId) || fail('ไม่พบไกด์'), pk = two ? 'payout2' : 'payout', amt = two ? +b.split.guide2 || 0 : b.split.guide;
    if (b.status !== 'paid' || !isDone(b)) fail('จ่ายได้เมื่อจบงานแล้วเท่านั้น'); if (b[pk]?.paid) fail('รายการนี้จ่ายแล้ว');
    if (!g.accountNo) fail('ไกด์ยังไม่มีเลขบัญชี — ให้ผู้จัดการไกด์เพิ่มก่อน');
    const ref = str(p.ref, 80); b[pk] = { paid: true, paidAt: nowISO(), paidBy: db.$actor.id, paidByName: db.$actor.name, ref };
    log(db, 'payout_confirm', `ยืนยันจ่ายค่าไกด์ ${g.firstName} ${g.lastName} ${baht(amt)} (${b.code}${two ? ' · ไกด์คนที่ 2' : ''}) บัญชี ${g.accountNo}${ref ? ' อ้างอิง ' + ref : ''}`);
    return { msg: 'บันทึกการจ่ายเงินแล้ว' };
  },
  /* ----- บัญชีหมู่บ้าน (รับส่วนกลางหมู่บ้าน) ----- */
  villageAcctSave(db, p) {
    need(db.$actor, 'payments');
    const v = { bankName: str(p.bankName, 80), accountName: str(p.accountName, 120), accountNo: str(p.accountNo, 40) };
    if (v.accountNo && !/^[0-9][0-9\- ]{5,29}$/.test(v.accountNo)) fail('เลขที่บัญชีต้องเป็นตัวเลข (ใส่ - หรือเว้นวรรคได้)');
    if (v.accountNo && (!v.accountName || !v.bankName)) fail('กรุณากรอกชื่อธนาคารและชื่อบัญชีให้ครบ');
    db.settings.villageAcct = v; log(db, 'settings', `แก้ไขบัญชีหมู่บ้าน: ${[v.bankName, v.accountName, v.accountNo].filter(Boolean).join(' ') || '(ล้างข้อมูล)'}`);
    return { msg: 'บันทึกบัญชีหมู่บ้านแล้ว' };
  },
  payVillage(db, p) {
    need(db.$actor, 'payout'); const v = db.settings.villageAcct || {};
    if (!v.accountNo) fail('ยังไม่ได้ตั้งค่าบัญชีหมู่บ้าน — ไปที่ บัญชี → บัญชีหมู่บ้าน');
    const want = Array.isArray(p.ids) ? new Set(p.ids) : null;
    const L = db.bookings.filter(b => vilDue(b) > 0 && !b.vpay?.paid && (!want || want.has(b.id))); // งานที่จบแล้ว + ส่วนที่ไม่คืนจากการคืนเงิน (เลือกเข้าหมู่บ้าน)
    if (!L.length) fail('ไม่มียอดค้างโอนให้หมู่บ้าน');
    const ref = str(p.ref, 80), tot = r2(L.reduce((a, b) => a + vilDue(b), 0)), vp = { paid: true, paidAt: nowISO(), paidBy: db.$actor.id, paidByName: db.$actor.name, ref, batch: uid() };
    L.forEach(b => { b.vpay = { ...vp } });
    const codes = L.map(b => b.code); log(db, 'payout_village', `ยืนยันโอนส่วนกลางหมู่บ้าน ${baht(tot)} (${L.length} กลุ่ม: ${codes.slice(0, 30).join(', ')}${codes.length > 30 ? ' …' : ''}) บัญชี ${v.bankName} ${v.accountNo}${ref ? ' อ้างอิง ' + ref : ''}`);
    return { msg: `บันทึกการโอนให้หมู่บ้าน ${baht(tot)} แล้ว` };
  },
  payVillageUndo(db, p) {
    need(db.$actor, 'payoutUndo'); const L = db.bookings.filter(b => b.vpay?.paid && b.vpay.batch === p.batch); if (!L.length) fail('ไม่พบรายการ');
    log(db, 'payout_undo', `ยกเลิกยืนยันโอนส่วนกลางหมู่บ้าน ${baht(L.reduce((a, b) => a + vilDue(b), 0))} (${L.length} กลุ่ม · เดิมยืนยันโดย ${L[0].vpay.paidByName})`);
    L.forEach(b => { delete b.vpay }); return { msg: 'ยกเลิกการยืนยันแล้ว' };
  },
  payUndo(db, p) {
    need(db.$actor, 'payoutUndo'); const b = byId(db, p.id), pk = +p.slot === 2 ? 'payout2' : 'payout'; if (!b[pk]?.paid) fail('รายการนี้ยังไม่ได้จ่าย');
    log(db, 'payout_undo', `ยกเลิกยืนยันจ่าย ${b.code}${pk === 'payout2' ? ' (ไกด์คนที่ 2)' : ''} (เดิมยืนยันโดย ${b[pk].paidByName})`); b[pk] = { paid: false }; return { msg: 'ยกเลิกการยืนยันแล้ว' };
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
    need(db.$actor, 'assign'); const b = byId(db, p.id), two = +p.slot === 2, key = two ? 'guide2Id' : 'guideId', gid = p.guideId || '', old = gObj(db, b[key]);
    if (b.status !== 'paid' || b.qn == null) fail('มอบหมายได้หลังชำระเงินแล้ว'); if (b.trip === 'started' || isDone(b)) fail('งานนี้เริ่มหรือจบแล้ว');
    if (two && needG(b) < 2) fail('งานนี้ใช้ไกด์ 1 คน');
    if (!gid) { b.manual = false; log(db, 'assign', `${b.code} กลับไปใช้คิวอัตโนมัติ`); rerunFrom(db, qKey(b)); return { msg: 'กลับไปใช้คิวอัตโนมัติแล้ว' } }
    const ng = gObj(db, gid) || fail('ไม่พบไกด์');
    if (gid === (two ? b.guideId : b.guide2Id)) fail('ไกด์คนนี้อยู่ในกลุ่มนี้แล้ว — เลือกคนอื่น');
    if (guideBlocked(db, gid, b.date, b.time, b.id)) fail(unavailOn(db, gid, b.date) ? 'ไกด์คนนี้แจ้งไม่ว่างในวันดังกล่าว' : 'ไกด์คนนี้ติดงานหรือรับงานครบแล้วในวันนั้น');
    if (old && old.id !== gid) notifyGuide(db, old, b, 'cancel');
    b[key] = gid; b.trip = 'assigned'; b.manual = true; notifyGuide(db, ng, b, 'new');
    log(db, 'assign', `กำหนดไกด์เอง ${b.code}${two ? ' (ไกด์คนที่ 2)' : ''} → ${gName(db, gid)} (เดิม ${old ? old.firstName : '-'})`);
    return { msg: 'มอบหมายและแจ้งเตือนไกด์แล้ว' };
  },
  autoAll(db) {
    need(db.$actor, 'assign');
    const un = db.bookings.filter(b => b.status === 'paid' && b.qn != null && ['unassigned', 'assigned'].includes(b.trip) && missingG(b) > 0 && b.date >= today());
    const n = un.length ? rerunFrom(db, un.map(qKey).sort()[0]).length : 0; return { msg: `จัดคิวใหม่ ${n} งาน` };
  },
  decline(db, p) {
    const b = byId(db, p.id); if (!ownTrip(db, b)) fail('ไม่ใช่งานของคุณ');
    const reason = str(p.reason, 300); if (!reason) fail('กรุณาระบุเหตุผล'); if (b.trip !== 'assigned') fail('งานนี้เริ่มเดินทางแล้ว แจ้งไม่ว่างไม่ได้');
    const me = db.$actor.guideId, res = p.wholeDay ? markGuideUnavailable(db, me, b.date, reason) : markGuideUnavailable(db, me, b.date, reason, b.id);
    return { msg: `แจ้งไม่ว่างแล้ว — จัดไกด์ใหม่ ${res.length} งาน` };
  },
  unavail(db, p) {
    need(db.$actor, 'markUnavail'); const reason = str(p.reason, 300); if (!reason) fail('กรุณาระบุเหตุผล');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date || '')) fail('กรุณาเลือกวันที่'); if (unavailOn(db, p.guideId, p.date)) fail('ไกด์คนนี้ถูกแจ้งไม่ว่างวันนั้นแล้ว');
    const res = markGuideUnavailable(db, p.guideId, p.date, reason);
    return { msg: `ย้ายคิวไปลำดับสุดท้าย และจัดไกด์ใหม่ ${res.length} งาน${res.some(c => c.short) ? ' (บางงานยังไม่มีไกด์ว่าง)' : ''}` };
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
    if (!acc && p.createAcct) { if (pw.length < 8) fail('รหัสผ่านบัญชีไกด์ต้องมีอย่างน้อย 8 ตัว'); if (db.users.some(u => u.username === uname)) fail(`ชื่อผู้ใช้ "${uname}" มีคนใช้แล้ว`) }
    if (acc && pw && pw.length < 8) fail('รหัสผ่านต้องมีอย่างน้อย 8 ตัว');
    if (isNew) { g = { id: 'g' + uid(), lineUserId: '' }; db.guides.push(g) }
    const wasRes = !!g.reserve, res = 'reserve' in p ? !!p.reserve : wasRes;
    Object.assign(g, { firstName: str(p.firstName, 60), lastName: str(p.lastName, 60), bankName: str(p.bankName, 60), accountNo: str(p.accountNo, 40), email: str(p.email, 120), phone: str(p.phone, 20), line: str(p.line, 60), active: !!p.active, reserve: res });
    if (res) g.rOrder = +p.rOrder || (wasRes ? g.rOrder : 0) || 999; else g.priority = +p.priority || (wasRes || isNew ? 999 : g.priority);
    if ('lineUserId' in p && can(db.$actor, 'markUnavail')) g.lineUserId = str(p.lineUserId, 64);
    normalizePriorities(db, g.id); log(db, 'guide', `${isNew ? 'เพิ่ม' : 'แก้ไข'}${res ? 'ไกด์สำรอง' : 'ไกด์'} ${g.firstName} ${g.lastName} (ลำดับ ${res ? 'S' + g.rOrder : g.priority})${!isNew && wasRes !== res ? ` · เปลี่ยนเป็น${res ? 'ไกด์สำรอง' : 'ไกด์หลัก'}` : ''}`);
    if (!isNew && wasRes !== res) reruns(db, db.bookings.filter(b => hasGuide(b, g.id) && b.date >= today() && !(b.rlock || []).includes(g.id)));
    let msg = 'บันทึกแล้ว';
    if (!acc && p.createAcct) { db.users.push({ id: 'u' + uid(), username: uname, pw: await ctx.hash(pw), name: g.firstName + ' ' + g.lastName, role: 'guide', guideId: g.id, active: true }); log(db, 'user', `สร้างบัญชีไกด์ ${uname} ให้ ${g.firstName} ${g.lastName}`); msg = `บันทึกแล้ว · ไกด์เข้าระบบด้วย ${uname}` }
    if (acc && pw) { acc.pw = await ctx.hash(pw); log(db, 'user', `ตั้งรหัสผ่านใหม่ให้บัญชีไกด์ ${acc.username}`) }
    return { msg };
  },
  guideToggle(db, p) { need(db.$actor, 'editGuides'); const g = gObj(db, p.id) || fail('ไม่พบไกด์'); g.active = !g.active; normalizePriorities(db, null); log(db, 'guide', `${g.active ? 'เปิด' : 'ปิด'}ใช้งานไกด์ ${g.firstName}`); return {} },
  guideMove(db, p) {
    need(db.$actor, 'editGuides'); const me = gObj(db, p.id) || fail('ไม่พบไกด์'), k = me.reserve ? 'rOrder' : 'priority';
    const L = db.guides.filter(g => !!g.reserve === !!me.reserve).sort((a, b) => (a[k] || 0) - (b[k] || 0)), i = L.indexOf(me), j = i + (+p.d);
    if (i < 0 || j < 0 || j >= L.length) return {}; [L[i][k], L[j][k]] = [L[j][k], L[i][k]]; normalizePriorities(db, null);
    log(db, 'guide', `ปรับลำดับ${me.reserve ? 'ไกด์สำรอง' : ''} ${L[i].firstName} ↔ ${L[j].firstName}`); return {};
  },
  guideType(db, p) { // ย้ายเป็นไกด์หลัก ↔ ไกด์สำรอง (ต่อท้ายลำดับ)
    need(db.$actor, 'editGuides'); const g = gObj(db, p.id) || fail('ไม่พบไกด์'), res = !!p.reserve; if (!!g.reserve === res) return {};
    g.reserve = res; if (res) g.rOrder = 999; else { g.priority = 999; g.pre = [] } normalizePriorities(db, null);
    log(db, 'guide', `${g.firstName} ${g.lastName} → ${res ? 'ไกด์สำรอง (S' + g.rOrder + ')' : 'ไกด์หลัก (ลำดับ ' + g.priority + ')'}`);
    reruns(db, db.bookings.filter(b => hasGuide(b, g.id) && b.date >= today() && !(b.rlock || []).includes(g.id)));
    return { msg: res ? `ย้ายเป็นไกด์สำรอง S${g.rOrder} แล้ว` : `ย้ายเป็นไกด์หลักลำดับ ${g.priority} แล้ว` };
  },
  /* ----- ไกด์สำรอง ----- */
  reserveSettings(db, p) {
    need(db.$actor, 'markUnavail'); const n = (v, lo, hi, d) => { const x = Math.round(+v); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d };
    db.settings.reserve = { mode: p.mode === 'manual' ? 'manual' : 'auto', waitMin: n(p.waitMin, 5, 1440, 180), nearHours: n(p.nearHours, 0, 72, 12), nearWaitMin: n(p.nearWaitMin, 5, 600, 30), rotate: !!p.rotate, countPre: !!p.countPre, notifyEmpty: !!p.notifyEmpty };
    const r = db.settings.reserve; log(db, 'settings', `ตั้งค่าไกด์สำรอง: ${r.mode === 'auto' ? 'อัตโนมัติ' : 'แอดมินกดเอง'} · รอตอบ ${r.waitMin} นาที (ใกล้เวลา ${r.nearWaitMin} นาที เมื่อเหลือ <${r.nearHours} ชม.) · หมุนลำดับ ${r.rotate ? 'เปิด' : 'ปิด'} · นับที่ว่างวันเปิดล่วงหน้า ${r.countPre ? 'เปิด' : 'ปิด'}`);
    return { msg: 'บันทึกการตั้งค่าไกด์สำรองแล้ว' };
  },
  reserveAsk(db, p) { // ส่งคำขอถึงสำรองคนถัดไป (หรือคนที่เลือก)
    need(db.$actor, 'assign'); const b = byId(db, p.id); if (!needsReserve(b)) fail('งานนี้ไม่ได้ขาดไกด์แล้ว');
    if (pendReq(b).length >= missingG(b)) fail('กำลังรอคำตอบจากไกด์สำรองอยู่ — กด "ข้ามไปคนถัดไป" ก่อน');
    let g;
    if (p.guideId) { g = gObj(db, p.guideId) || fail('ไม่พบไกด์'); if (!g.reserve || !g.active) fail('ไกด์คนนี้ไม่ใช่ไกด์สำรอง'); if (hasGuide(b, g.id) || guideBlocked(db, g.id, b.date, b.time, b.id, b) || reqBusy(db, g.id, b)) fail('ไกด์สำรองคนนี้ไม่ว่างในรอบนั้น') }
    else g = nextReserve(db, b) || fail('ไม่มีไกด์สำรองที่ว่างและยังไม่เคยถามสำหรับงานนี้');
    askReserve(db, b, g); return { msg: `ส่งคำขอถึง ${g.firstName} แล้ว` };
  },
  reserveSkip(db, p) {
    need(db.$actor, 'assign'); const b = byId(db, p.id), L = pendReq(b); if (!L.length) fail('ไม่มีคำขอที่รอตอบ');
    L.forEach(r => { r.st = 'skipped'; r.endAt = nowISO(); r.by = db.$actor.name });
    log(db, 'reserve', `ข้ามไกด์สำรอง ${L.map(r => gName(db, r.gid)).join(', ')} — ${b.code}`);
    return { msg: RS(db).mode === 'auto' ? 'ข้ามแล้ว — ส่งคำขอถึงคนถัดไป' : 'ข้ามแล้ว' };
  },
  reservePre(db, p) { // เปิดใช้สำรองล่วงหน้า (รายวัน) — นับเป็นไกด์ของวันนั้นต่อจากไกด์หลัก
    need(db.$actor, 'editGuides'); const g = gObj(db, p.id) || fail('ไม่พบไกด์'); if (!g.reserve) fail('ไกด์คนนี้ไม่ใช่ไกด์สำรอง');
    const D = /^\d{4}-\d{2}-\d{2}$/; if (!D.test(p.from || '') || !D.test(p.to || p.from)) fail('กรุณาเลือกวันที่'); const to = p.to || p.from;
    if (to < p.from) fail('วันที่สิ้นสุดต้องไม่ก่อนวันเริ่ม'); const days = []; for (let d = p.from; d <= to && days.length < 62; d = addDays(d, 1)) if (d >= today()) days.push(d);
    if (!days.length) fail('เลือกได้เฉพาะวันนี้เป็นต้นไป');
    g.pre = [...new Set([...(g.pre || []).filter(d => d >= today()), ...days])].sort();
    const txt = days.length > 1 ? `${fmtDateS(days[0])} – ${fmtDateS(days[days.length - 1])}` : fmtDate(days[0]);
    const msg = `[ผาแง่ม] 📅 คุณถูกเปิดใช้เป็นไกด์สำรองล่วงหน้า
วันที่ ${txt}
วันดังกล่าวคุณจะได้รับงานต่อจากไกด์หลัก ถ้าไม่สะดวกวันไหน กด "แจ้งไม่ว่าง" ในแอปได้

${SITE_URL}/#admin-today`;
    const base = { at: nowISO(), guideId: g.id, bookingId: '', kind: 'reserve', message: msg, status: 'pending' };
    db.$notify.push({ ...base, id: uid(), channel: 'line', to: g.lineUserId || '', toLabel: g.line || '' });
    if (g.email) db.$notify.push({ ...base, id: uid(), channel: 'email', to: g.email, toLabel: g.email, subject: `[ผาแง่ม] เปิดใช้ไกด์สำรองล่วงหน้า ${txt}` });
    db.$notify.push({ ...base, id: uid(), channel: 'push', to: 'guide:' + g.id, toLabel: 'แอป', title: '📅 เปิดใช้ไกด์สำรองล่วงหน้า', body: txt, url: '/#admin-today' });
    log(db, 'reserve', `เปิดใช้ไกด์สำรองล่วงหน้า ${g.firstName} ${g.lastName}: ${txt}`);
    reruns(db, db.bookings.filter(b => days.includes(b.date) && missingG(b) > 0));
    return { msg: `เปิดใช้ ${g.firstName} ล่วงหน้า ${days.length} วันแล้ว` };
  },
  reservePreDel(db, p) {
    need(db.$actor, 'editGuides'); const g = gObj(db, p.id) || fail('ไม่พบไกด์'); g.pre = (g.pre || []).filter(d => d !== p.date);
    log(db, 'reserve', `ยกเลิกเปิดใช้ล่วงหน้า ${g.firstName} ${g.lastName} วันที่ ${fmtDate(p.date)}`);
    reruns(db, db.bookings.filter(b => b.date === p.date && hasGuide(b, g.id) && !(b.rlock || []).includes(g.id)));
    return { msg: 'ยกเลิกแล้ว' };
  },
  reserveAccept(db, p) { // ไกด์สำรองกดรับงาน
    const me = db.$actor.guideId; if (db.$actor.role !== 'guide' || !me) fail('สำหรับไกด์เท่านั้น');
    const b = byId(db, p.id), r = pendReq(b).find(x => x.gid === me) || fail('คำขอนี้หมดเวลาหรือถูกยกเลิกแล้ว'), g = gObj(db, me);
    if (!needsReserve(b)) { r.st = 'cancelled'; r.endAt = nowISO(); return { msg: 'งานนี้ได้ไกด์ครบแล้ว ขอบคุณครับ' } }
    if (guideBlocked(db, me, b.date, b.time, b.id, b)) fail('คุณติดงานอื่นในช่วงเวลานี้');
    if (!b.guideId) b.guideId = me; else b.guide2Id = me;
    b.rlock = [...new Set([...(b.rlock || []), me])]; r.st = 'accepted'; r.endAt = nowISO(); b.trip = 'assigned'; b.rempty = false;
    if (RS(db).rotate) moveToLast(db, me);
    notifyGuide(db, g, b, 'new');
    notifyManagers(db, '✅ ไกด์สำรองรับงานแล้ว', `${g.firstName} ${g.lastName} · ${b.code} · ${fmtDateS(b.date)} ${b.time} น.${missingG(b) ? ` · ยังขาดอีก ${missingG(b)} คน` : ''}`, b.id);
    log(db, 'reserve', `ไกด์สำรอง ${g.firstName} ${g.lastName} รับงาน ${b.code} (${fmtDateS(b.date)} ${b.time} น.)${RS(db).rotate ? ` · ย้ายไปลำดับ S${g.rOrder}` : ''}`);
    return { msg: 'รับงานแล้ว — งานนี้เป็นของคุณ' };
  },
  myUnavail(db, p) { // ไกด์แจ้งวันที่ไม่สะดวกเอง (ใช้กับไกด์สำรองที่ยังไม่มีงาน)
    const me = db.$actor.guideId; if (db.$actor.role !== 'guide' || !me) fail('สำหรับไกด์เท่านั้น');
    const reason = str(p.reason, 300); if (!reason) fail('กรุณาระบุเหตุผล');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date || '') || p.date < today()) fail('กรุณาเลือกวันที่ตั้งแต่วันนี้');
    if (unavailOn(db, me, p.date)) fail('คุณแจ้งไม่สะดวกวันนั้นไว้แล้ว');
    const res = markGuideUnavailable(db, me, p.date, reason);
    return { msg: `แจ้งไม่สะดวก ${fmtDate(p.date)} แล้ว${res.length ? ` — จัดไกด์ใหม่ ${res.length} งาน` : ''}` };
  },
  reserveDecline(db, p) {
    const me = db.$actor.guideId; if (db.$actor.role !== 'guide' || !me) fail('สำหรับไกด์เท่านั้น');
    const b = byId(db, p.id), r = pendReq(b).find(x => x.gid === me) || fail('คำขอนี้หมดเวลาหรือถูกยกเลิกแล้ว'), g = gObj(db, me);
    r.st = 'declined'; r.reason = str(p.reason, 300); r.endAt = nowISO();
    notifyManagers(db, '🙅 ไกด์สำรองไม่สะดวก', `${g.firstName} ${g.lastName} · ${b.code} · ${fmtDateS(b.date)} ${b.time} น.${r.reason ? ' — ' + r.reason : ''}`, b.id);
    log(db, 'reserve', `ไกด์สำรอง ${g.firstName} ${g.lastName} ไม่สะดวก ${b.code}${r.reason ? ' — ' + r.reason : ''}`);
    return { msg: 'แจ้งไม่สะดวกแล้ว — ระบบส่งต่อให้ไกด์สำรองคนถัดไป' };
  },
  notifyJobs(db, p) {
    need(db.$actor, 'assign'); const ids = new Set(Array.isArray(p.ids) ? p.ids : []);
    const L = db.bookings.filter(b => ids.has(b.id) && b.status === 'paid' && b.guideId && b.date >= today() && !isDone(b));
    if (!L.length) fail('ไม่มีงานที่แจ้งได้');
    const noCh = new Set();
    L.forEach(b => gIds(b).forEach(id => { const g = gObj(db, id); if (!g) return; notifyGuide(db, g, b, 'job'); if (!g.lineUserId && !g.email) noCh.add(g.firstName) }));
    log(db, 'notify', `แจ้งงานไกด์ ${L.length} งาน: ${L.map(b => `${b.code}→${gNames(db, b)}`).join(', ')}`);
    return { msg: `ส่งแจ้งเตือน ${L.length} งานแล้ว${noCh.size ? ` · ⚠ ${[...noCh].join(', ')} ยังไม่ผูก LINE และไม่มีอีเมล` : ''}` };
  },
  guideMessage(db, p) {
    need(db.$actor, 'editGuides'); const text = String(p.text || '').trim().slice(0, 1000); if (!text) fail('กรุณาพิมพ์ข้อความ');
    const ids = p.all ? null : new Set(Array.isArray(p.ids) ? p.ids : []);
    const G = db.guides.filter(g => g.active !== false && (!ids || ids.has(g.id))); if (!G.length) fail('กรุณาเลือกไกด์อย่างน้อย 1 คน');
    const from = db.$actor.name, head = `📢 ข้อความจาก ${from}`;
    G.forEach(g => {
      const base = { at: nowISO(), guideId: g.id, bookingId: '', kind: 'msg', fromName: from, message: `[ผาแง่ม] ${head}\n\n${text}\n\nเปิดแอป: ${SITE_URL}/#admin-inbox`, status: 'pending' };
      db.$notify.push({ ...base, id: uid(), channel: 'line', to: g.lineUserId || '', toLabel: g.line || '' });
      if (g.email) db.$notify.push({ ...base, id: uid(), channel: 'email', to: g.email, toLabel: g.email, subject: `[ผาแง่ม] ${head}` });
      db.$notify.push({ ...base, id: uid(), channel: 'push', to: 'guide:' + g.id, toLabel: 'แอป', title: head, body: text.slice(0, 180), url: '/#admin-inbox' });
    });
    log(db, 'notify', `ส่งข้อความถึงไกด์ ${G.length} คน (${G.map(g => g.firstName).join(', ')}): ${text.slice(0, 80)}`);
    return { msg: `ส่งข้อความถึงไกด์ ${G.length} คนแล้ว (LINE · อีเมล · แอป)` };
  },
  notifSeen(db) { const u = db.users.find(x => x.id === db.$actor.id); if (u) u.notifSeenAt = nowISO(); return {} },
  guideTestAll(db) {
    need(db.$actor, 'editGuides'); const G = db.guides.filter(g => g.active !== false); if (!G.length) fail('ยังไม่มีไกด์ที่เปิดใช้งาน');
    G.forEach(g => notifyGuide(db, g, { code: 'TEST', date: today(), time: '06:00', name: 'ทดสอบระบบ', people: 0, phone: '-' }, 'test'));
    log(db, 'notify', `ทดสอบแจ้งเตือนไกด์ทั้งหมด ${G.length} คน (LINE · อีเมล · แอป)`);
    const ln = G.filter(g => g.lineUserId).length, em = G.filter(g => g.email).length;
    return { msg: `ส่งทดสอบถึงไกด์ ${G.length} คนแล้ว · LINE ผูกแล้ว ${ln}/${G.length} · มีอีเมล ${em}/${G.length} · ดูผลที่เมนูการแจ้งเตือน` };
  },
  guideTest(db, p) { need(db.$actor, 'editGuides'); const g = gObj(db, p.id) || fail('ไม่พบไกด์'); notifyGuide(db, g, { code: 'TEST', date: today(), time: '06:00', name: 'ทดสอบระบบ', people: 0, phone: '-' }, 'test'); return { msg: 'ส่งแจ้งเตือนทดสอบแล้ว ดูผลที่เมนูการแจ้งเตือน' } },
  async userSave(db, p, ctx) {
    need(db.$actor, 'users'); const username = str(p.username, 40), name = str(p.name, 80), pw = String(p.password || '');
    if (!username || !name) fail('กรุณากรอกข้อมูลให้ครบ'); if (!ROLES[p.role]) fail('ตำแหน่งไม่ถูกต้อง');
    const email = str(p.email, 120), phone = str(p.phone, 20);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) fail('อีเมลไม่ถูกต้อง');
    if (phone && !/^[0-9+\-\s()]{8,20}$/.test(phone)) fail('เบอร์โทรศัพท์ไม่ถูกต้อง');
    let u = p.id && db.users.find(x => x.id === p.id);
    if (db.users.some(x => x.username === username && x !== u)) fail('ชื่อผู้ใช้นี้มีแล้ว');
    if (!u && pw.length < 8) fail('รหัสผ่านต้องมีอย่างน้อย 8 ตัว'); if (u && pw && pw.length < 8) fail('รหัสผ่านต้องมีอย่างน้อย 8 ตัว');
    if (u && u.id === db.$actor.id && (p.role !== 'superadmin' || !p.active)) fail('ไม่สามารถลดสิทธิ์/ระงับบัญชีตัวเองได้');
    const isNew = !u; if (isNew) { u = { id: 'u' + uid() }; db.users.push(u) }
    Object.assign(u, { username, name, email, phone, role: p.role, guideId: p.role === 'guide' ? p.guideId || null : null, active: !!p.active }); if (pw) u.pw = await ctx.hash(pw);
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
      entryRates: Object.fromEntries(PAX.map(([k]) => [k, n('er_' + k)])), vehicleFee: n('vehicleFee'), motoFee: n('motoFee'), extraGuideFee: p.extraGuideFee != null && p.extraGuideFee !== '' ? n('extraGuideFee') : +(s.extraGuideFee ?? 700),
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
    if ('slipStrict' in p) db.settings.slipStrict = !!p.slipStrict;
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
  /* ----- บัญชี: สมุดรายวัน ----- */
  acctSettings(db, p) {
    need(db.$actor, 'acctSetup'); const cur = AS(db);
    const list = (v, d) => { const L = String(v ?? '').split(/\n/).map(x => str(x, 60)).filter(Boolean).slice(0, 40); return L.length ? [...new Set(L)] : d };
    const start = db.acct?.on ? cur.start : /^\d{4}-\d{2}-\d{2}$/.test(p.start || '') ? p.start : cur.start;
    db.settings.acct = { start, bankLabel: str(p.bankLabel, 120), cats: list(p.cats, cur.cats), icats: list(p.icats, cur.icats),
      signers: SIGN_ROLES.map((role, i) => ({ role, name: str(p['sg' + i], 80), pos: str(p['sp' + i], 80) })) };
    log(db, 'acct', `ตั้งค่าบัญชี: วันเริ่ม ${fmtDate(start)} · หมวดรายจ่าย ${db.settings.acct.cats.length} · ผู้ลงชื่อ ${db.settings.acct.signers.map(x => x.name || '-').join(' / ')}`);
    return { msg: 'บันทึกการตั้งค่าบัญชีแล้ว' };
  },
  acctOpen(db, p) { // เปิดใช้สมุดบัญชี: ยอดยกมา = ยอดธนาคารที่กรอก + สถานะการจองปัจจุบัน
    need(db.$actor, 'acctSetup'); if (db.acct?.on) fail('เปิดใช้สมุดบัญชีแล้ว');
    const S = AS(db); if (today() < S.start) fail(`เปิดใช้ได้ตั้งแต่ ${fmtDate(S.start)} (เปลี่ยนวันเริ่มได้ที่ ⚙️ ตั้งค่าบัญชี)`);
    if (p.bank === '' || p.bank == null || !Number.isFinite(+p.bank)) fail('กรุณากรอกยอดเงินในบัญชีธนาคาร');
    const B = r2(p.bank), P = r2(p.park || 0); if (P < 0) fail('ค่าอุทยานค้างนำส่งต้องไม่ติดลบ');
    const pv = openPreview(db);
    db.acct = { on: true, start: today(), openAt: nowISO(), bal: Object.fromEntries(WAL.map(w => [w, 0])), seq: {}, n: 0, openPark: P, pr: [], mon: {}, per: {} };
    const lines = { bank: B, dep: pv.dep, gd: pv.gd, vil: pv.vil, ref: pv.ref, park: P, fund: r2(B - pv.dep - pv.gd - pv.vil - pv.ref - P) };
    const row = post(db, { type: 'open', desc: `ยอดยกมา — เปิดใช้สมุดบัญชี (การจองที่ชำระแล้ว ${pv.paid} รายการ · จบงานแล้ว ${pv.done})`, lines, note: str(p.note, 300), meta: { ...pv, bank: B, park: P } });
    db.acct.openNo = row.no;
    for (const b of db.bookings) {
      const F = factsOf(b); if (!F.pay) continue;
      b.lk = Object.fromEntries(Object.entries(F).map(([k, l]) => [k, { no: row.no, l: clean(l) }]));
      if (isDone(b) && !b.ppay) b.ppay = { paid: true, opening: true }; // งานที่จบก่อนเปิดใช้: ค่าอุทยานรวมอยู่ในยอดยกมา
    }
    log(db, 'acct', `เปิดใช้สมุดบัญชี ${row.no}: ธนาคาร ${baht(B)} · รับล่วงหน้า ${baht(pv.dep)} · ค้างจ่ายไกด์ ${baht(pv.gd)} · ค้างโอนหมู่บ้าน ${baht(pv.vil)}${pv.ref ? ` · ค้างคืนลูกค้า ${baht(pv.ref)}` : ''} · ค้างนำส่งอุทยาน ${baht(P)} · กองทุน ${baht(lines.fund)}`);
    return { msg: `เปิดใช้สมุดบัญชีแล้ว (${row.no})` };
  },
  acctReset(db, p) { // ล้างสมุดบัญชีทั้งหมด (ใช้ช่วงทดลองก่อนใช้งานจริง)
    need(db.$actor, 'acctRev'); if (!db.acct?.on) fail('ยังไม่ได้เปิดใช้สมุดบัญชี');
    if (String(p.confirm || '').trim() !== 'ล้างสมุดบัญชี') fail('พิมพ์คำว่า “ล้างสมุดบัญชี” เพื่อยืนยัน');
    const n = db.acct.n || 0; db.acct = null; db.$ledgerReset = true; db.$ledger = []; db.$ledgerUpd = [];
    db.bookings.forEach(b => { delete b.lk; delete b.ppay });
    log(db, 'acct', `ล้างสมุดบัญชี (ลบ ${n} รายการ) — ต้องเปิดใช้ใหม่พร้อมยอดยกมา`); return { msg: 'ล้างสมุดบัญชีแล้ว' };
  },
  acctEntry(db, p) { // รายจ่ายอื่น (จ่ายจากกองทุน/ส่วนกลางหมู่บ้าน) · รายรับอื่น (เข้ากองทุน)
    need(db.$actor, 'acctPost'); acctOn(db); const A = db.acct, exp = p.kind === 'exp';
    const amt = r2(p.amt); if (!(amt > 0) || amt > 1e7) fail('กรุณากรอกจำนวนเงินให้ถูกต้อง');
    const date = acctDate(db, p.date), cat = str(p.cat, 60) || 'อื่นๆ', party = str(p.party, 120), note = str(p.note, 300), proof = proofOk(p.proof);
    let row;
    if (exp) {
      const from = p.from === 'vil' ? 'vil' : 'fund';
      if (from === 'vil' && amt > r2(A.bal.vil)) fail(`ยอดค้างโอนหมู่บ้านมี ${baht(A.bal.vil)} — จ่ายจากส่วนกลางหมู่บ้านเกินยอดไม่ได้`);
      row = post(db, { type: 'exp', date, cat, party, note, proof, desc: `${cat}${party ? ' · ' + party : ''}`, lines: { bank: -amt, [from]: -amt }, meta: { from } });
    } else row = post(db, { type: 'inc', date, cat, party, note, proof, desc: `${cat}${party ? ' · จาก ' + party : ''}`, lines: { bank: amt, fund: amt } });
    log(db, 'acct', `บันทึก${exp ? 'รายจ่าย' : 'รายรับ'} ${row.no} ${baht(amt)} · ${row.desc}`);
    return { msg: `บันทึก${exp ? 'รายจ่าย' : 'รายรับ'}แล้ว (${row.no})`, no: row.no };
  },
  parkPay(db, p) { // นำส่งเงินให้อุทยานเป็นรอบ: เลือกช่วงวันเดินป่า (+ ยอดยกมา)
    need(db.$actor, 'acctPost'); acctOn(db); const A = db.acct;
    const from = /^\d{4}-\d{2}-\d{2}$/.test(p.from || '') ? p.from : '0000-01-01', to = /^\d{4}-\d{2}-\d{2}$/.test(p.to || '') ? p.to : '9999-12-31';
    const L = db.bookings.filter(b => parkOpen(b) && !parkWait(b) && b.date >= from && b.date <= to).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    const lump = p.open ? r2(A.openPark || 0) : 0, amts = L.map(parkDue), tot = r2(amts.reduce((a, x) => a + x, 0) + lump);
    if (!(tot > 0)) fail('ไม่มียอดค้างนำส่งในช่วงนี้');
    if (p.total != null && r2(p.total) !== tot) fail(`ยอดเปลี่ยนไประหว่างทำรายการ (ล่าสุด ${baht(tot)}) — กรุณาตรวจอีกครั้ง`);
    const date = acctDate(db, p.date || today()), ref = str(p.ref, 80), proof = proofOk(p.proof), note = str(p.note, 300);
    const S = f => L.reduce((a, b) => a + f(b), 0), noFee = b => b.phold === 'fund';
    const meta = { n: L.length, from: L[0]?.date || '', to: L.at(-1)?.date || '', ta: S(b => noFee(b) ? 0 : +b.pax?.ta || 0), fa: S(b => noFee(b) ? 0 : +b.pax?.fa || 0), cars: S(b => noFee(b) ? 0 : +b.vehicles || 0), motos: S(b => noFee(b) ? 0 : +b.motos || 0),
      svc: r2(S(b => +b.split?.park || 0)), entry: r2(S(b => noFee(b) ? 0 : +b.entryTotal || 0)), veh: r2(S(b => noFee(b) ? 0 : +b.vehicleTotal || 0)), open: lump };
    const rg = meta.n ? (meta.from === meta.to ? ` (เดิน ${fmtDateS(meta.from)})` : ` (เดิน ${fmtDateS(meta.from)} – ${fmtDateS(meta.to)})`) : '';
    const row = post(db, { type: 'ppay', date, ref, proof, note, desc: `นำส่งอุทยาน ${meta.n} กลุ่ม${rg}${lump ? ` + ยอดยกมา ${baht(lump)}` : ''}`, lines: { park: -tot, bank: -tot }, bids: L.map(b => b.id), meta });
    L.forEach((b, i) => { b.ppay = { paid: true, no: row.no, amt: amts[i], date, at: row.at } });
    A.openPark = r2((A.openPark || 0) - lump);
    A.pr = [{ no: row.no, date, amt: tot, ref, proof, by: row.by, at: row.at, ...meta }, ...(A.pr || [])].slice(0, 300);
    log(db, 'acct', `นำส่งอุทยาน ${row.no} ${baht(tot)} · ${meta.n} กลุ่ม${rg}${ref ? ' · ใบเสร็จ ' + ref : ''}`);
    return { msg: `บันทึกนำส่งอุทยาน ${baht(tot)} แล้ว (${row.no})`, no: row.no };
  },
  parkHold(db, p) { // ลูกค้าไม่มา/ยกเลิก: ค่าเข้า+ค่ารถ → นำส่งอุทยานตามปกติ หรือ ไม่ต้องนำส่ง (เข้ากองทุน)
    need(db.$actor, 'acctPost'); acctOn(db); const b = byId(db, p.id);
    if (!(b.status === 'paid' && isDone(b) && holdAmt(b) > 0)) fail('รายการนี้ไม่มีค่าอุทยานที่รอตัดสินใจ'); if (b.ppay) fail('รายการนี้นำส่งอุทยานแล้ว');
    if (!['park', 'fund'].includes(p.to)) fail('กรุณาเลือกวิธีจัดการ'); if (b.phold) fail('ตัดสินใจรายการนี้ไปแล้ว');
    b.phold = p.to; b.pholdBy = db.$actor.name; b.pholdAt = nowISO();
    log(db, 'acct', `${b.code} ค่าเข้า/ค่ารถอุทยาน ${baht(holdAmt(b))}: ${p.to === 'park' ? 'นำส่งอุทยานตามปกติ' : 'อุทยานไม่เก็บ → เข้ากองทุนดำเนินงาน'}`);
    return { msg: p.to === 'park' ? 'ย้ายไปรายการรอนำส่งแล้ว' : 'ย้ายเข้ากองทุนดำเนินงานแล้ว' };
  },
  parkHoldUndo(db, p) {
    need(db.$actor, 'acctRev'); const b = byId(db, p.id); if (!b.phold) fail('ยังไม่ได้ตัดสินใจรายการนี้'); if (b.ppay) fail('นำส่งอุทยานแล้ว — กลับรายการนำส่งก่อน');
    log(db, 'acct', `${b.code} ยกเลิกการตัดสินใจค่าอุทยาน (เดิม: ${b.phold === 'park' ? 'นำส่ง' : 'เข้ากองทุน'})`); delete b.phold; delete b.pholdBy; delete b.pholdAt;
    return { msg: 'กลับไปสถานะรอถามอุทยานแล้ว' };
  },
  acctReverse(db, p, ctx) { // กลับรายการที่บันทึกเอง (รายจ่าย/รายรับ/นำส่งอุทยาน) — รายการอัตโนมัติให้ยกเลิกที่ต้นทาง
    need(db.$actor, 'acctRev'); acctOn(db); const A = db.acct;
    const e = ctx?.ledgerGet?.(String(p.no || '')) || fail('ไม่พบรายการ');
    if (e.auto) fail('รายการนี้ลงอัตโนมัติจากการจอง — ยกเลิกที่ต้นทาง (เช่น “ยกเลิกการยืนยัน” ในหน้าเบิกจ่าย) แล้วระบบจะกลับรายการให้เอง');
    if (e.type === 'open') fail('ยอดยกมากลับรายการไม่ได้ (ถ้าต้องเริ่มใหม่ ใช้ “ล้างสมุดบัญชี”)'); if (e.type === 'rev') fail('รายการกลับ กลับซ้ำไม่ได้');
    if (e.revBy) fail(`กลับรายการไปแล้ว (${e.revBy})`);
    const reason = str(p.reason, 200) || fail('กรุณาใส่เหตุผล');
    const row = post(db, { type: 'rev', revOf: e.no, of: e.type, cat: e.cat, ref: e.ref, note: reason, desc: `กลับรายการ ${e.no} (${e.desc}) — ${reason}`, lines: negL(e.lines), bids: e.bids || [] });
    (db.$ledgerUpd ||= []).push({ no: e.no, revBy: row.no, revReason: reason });
    if (e.type === 'ppay') {
      db.bookings.forEach(b => { if (b.ppay?.no === e.no) delete b.ppay });
      A.openPark = r2((A.openPark || 0) + (+e.meta?.open || 0)); const r = (A.pr || []).find(x => x.no === e.no); if (r) r.rev = row.no;
    }
    log(db, 'acct', `กลับรายการ ${e.no} → ${row.no} · ${reason}`); return { msg: `กลับรายการแล้ว (${row.no})` };
  },
  /* ----- คืนเงินลูกค้า: ผู้ดูแลกำหนดยอดคืนเองทุกครั้ง → รอโอนคืน → การเงินโอนแล้วแนบสลิป ----- */
  refundApprove(db, p) {
    need(db.$actor, 'refundApprove'); const b = byId(db, p.id);
    if (b.status !== 'paid' || b.trip === 'started' || isDone(b)) fail('คืนเงินได้เฉพาะการจองที่ชำระแล้วและยังไม่เริ่มเดินทาง');
    const T = +b.total || 0, amt = r2(String(p.amt ?? '').replace(/,/g, ''));
    if (!(amt > 0) || amt > T) fail(`ยอดคืนต้องมากกว่า 0 และไม่เกินยอดชำระ ${baht(T)}`);
    const reason = str(p.reason, 200) || fail('กรุณาใส่เหตุผล'), to = str(p.to, 200) || fail('กรุณาใส่บัญชี/พร้อมเพย์ที่จะโอนคืนลูกค้า');
    const keep = p.keep === 'vil' ? 'vil' : 'fund', keepAmt = r2(T - amt), oldKey = qKey(b), G = gIds(b).map(id => gObj(db, id)).filter(Boolean);
    G.forEach(g => notifyGuide(db, g, b, 'cancel'));
    b.guideId = null; b.guide2Id = null; b.trip = 'unassigned'; b.manual = false; b.rlock = [];
    b.status = 'cancelled'; b.cancelReason = 'ยกเลิกและคืนเงิน'; b.cancelledAt = nowISO();
    b.refund = { amt, keep, keepAmt, reason, to, st: 'pending', at: nowISO(), by: db.$actor.id, byName: db.$actor.name };
    if (b.qn != null) rerunFrom(db, oldKey); // คืนตำแหน่งในคิวไกด์
    notifyCustomer(db, b, 'refund_ok');
    log(db, 'refund', `ยกเลิกและคืนเงิน ${b.code} คืน ${baht(amt)}${keepAmt ? ` · ส่วนที่ไม่คืน ${baht(keepAmt)} → ${keep === 'vil' ? 'ส่วนกลางหมู่บ้าน' : 'กองทุนดำเนินงาน'}` : ''} · ${reason}${G.length ? ` · ยกเลิกงานไกด์ ${G.map(g => g.firstName).join(', ')}` : ''}`);
    return { msg: `ยกเลิกแล้ว — รอโอนคืน ${baht(amt)} (ดูที่ บัญชี → คืนเงิน)` };
  },
  refundPay(db, p) {
    need(db.$actor, 'refundPay'); const b = byId(db, p.id), r = b.refund; if (!r || r.st !== 'pending') fail('รายการนี้ไม่ได้รอโอนคืน');
    const date = /^\d{4}-\d{2}-\d{2}$/.test(p.date || '') ? p.date : today(); if (date > today()) fail('วันที่โอนต้องไม่เกินวันนี้');
    const proof = proofOk(p.proof) || fail('กรุณาแนบสลิปการโอนคืน');
    Object.assign(r, { st: 'paid', date, ref: str(p.ref, 80), proof, paidAt: nowISO(), paidBy: db.$actor.id, paidByName: db.$actor.name });
    notifyCustomer(db, b, 'refunded'); log(db, 'refund', `โอนคืนเงินแล้ว ${b.code} ${baht(r.amt)}${r.ref ? ' อ้างอิง ' + r.ref : ''}`);
    return { msg: 'บันทึกการโอนคืนแล้ว — ส่งอีเมลแจ้งลูกค้า' };
  },
  refundPayUndo(db, p) {
    need(db.$actor, 'acctRev'); const b = byId(db, p.id), r = b.refund; if (!r || r.st !== 'paid') fail('รายการนี้ยังไม่ได้โอนคืน');
    log(db, 'refund', `ยกเลิกการยืนยันโอนคืน ${b.code} ${baht(r.amt)} (เดิมโดย ${r.paidByName})`);
    ['date', 'ref', 'proof', 'paidAt', 'paidBy', 'paidByName'].forEach(k => delete r[k]); r.st = 'pending';
    return { msg: 'กลับเป็นรอโอนคืนแล้ว' };
  },
  /* ----- กระทบยอดธนาคาร · ปิดงวดรายเดือน ----- */
  acctRecon(db, p) {
    need(db.$actor, 'acctClose'); acctOn(db); const A = db.acct, ym = String(p.ym || '');
    if (!/^\d{4}-\d{2}$/.test(ym) || ym < A.start.slice(0, 7) || ym > ymNow()) fail('เดือนไม่ถูกต้อง');
    if (A.per?.[ym]?.closed) fail('งวดนี้ปิดแล้ว');
    if (p.stmt === '' || p.stmt == null || !Number.isFinite(+String(p.stmt).replace(/,/g, ''))) fail('กรุณากรอกยอดคงเหลือตาม statement');
    const stmt = r2(String(p.stmt).replace(/,/g, '')), sys = walEnd(A, ym).bank, proof = proofOk(p.proof) || A.per?.[ym]?.proof || '';
    (A.per ||= {})[ym] = { ...(A.per[ym] || {}), stmt, sys, diff: r2(stmt - sys), proof, recAt: nowISO(), recBy: db.$actor.name };
    log(db, 'acct', `กระทบยอดธนาคาร ${ym}: statement ${baht(stmt)} · ตามระบบ ${baht(sys)} · ผลต่าง ${baht(r2(stmt - sys))}`);
    return { msg: Math.abs(stmt - sys) < 0.005 ? 'ยอดตรงกัน ✓ ปิดงวดได้' : `บันทึกแล้ว — ผลต่าง ${baht(r2(stmt - sys))}` };
  },
  acctClose(db, p) {
    need(db.$actor, 'acctClose'); acctOn(db); const A = db.acct, ym = String(p.ym || ''), st = A.start.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(ym) || ym < st) fail('เดือนไม่ถูกต้อง'); if (ym >= ymNow()) fail('ปิดงวดได้หลังสิ้นเดือนแล้วเท่านั้น');
    const P = A.per?.[ym]; if (P?.closed) fail('งวดนี้ปิดแล้ว'); if (!P || P.stmt == null) fail('กรุณากระทบยอดกับ statement ธนาคารก่อน');
    for (let m = st; m < ym; m = addDays(m + '-28', 5).slice(0, 7)) if (!A.per?.[m]?.closed) fail(`กรุณาปิดงวด ${m} ก่อน (ปิดเรียงตามเดือน)`);
    const sys = walEnd(A, ym).bank, diff = r2(P.stmt - sys), note = str(p.note, 300);
    if (Math.abs(diff) >= 0.005 && !note) fail(`ยอดยังไม่ตรง (ผลต่าง ${baht(diff)}) — บันทึกรายการที่ขาดก่อน หรืออธิบายผลต่างเพื่อปิดงวด`);
    Object.assign(P, { closed: true, sys, diff, note, wal: walEnd(A, ym), closedAt: nowISO(), closedBy: db.$actor.name });
    log(db, 'acct', `ปิดงวด ${ym}: ธนาคารตามระบบ ${baht(sys)} · statement ${baht(P.stmt)}${diff ? ` · ผลต่าง ${baht(diff)} (${note})` : ''}`);
    return { msg: `ปิดงวด ${ym} แล้ว` };
  },
  acctReopen(db, p) {
    need(db.$actor, 'acctRev'); acctOn(db); const A = db.acct, ym = String(p.ym || ''), P = A.per?.[ym];
    if (!P?.closed) fail('งวดนี้ยังไม่ได้ปิด'); if (Object.entries(A.per).some(([m, x]) => m > ym && x.closed)) fail('ต้องเปิดงวดล่าสุดก่อน (เปิดย้อนเรียงจากเดือนล่าสุด)');
    const reason = str(p.reason, 200) || fail('กรุณาใส่เหตุผล');
    P.closed = false; (P.reopen ||= []).push({ at: nowISO(), by: db.$actor.name, reason });
    log(db, 'acct', `เปิดงวด ${ym} กลับ · ${reason}`); return { msg: `เปิดงวด ${ym} แล้ว` };
  },
};
