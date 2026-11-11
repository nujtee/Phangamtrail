// Durable Object: ทุกคำสั่งถูกประมวลผลทีละคำสั่ง (ไม่มีการจองชนกัน) และบันทึกลง SQLite ของ Durable Object
import { DurableObject } from 'cloudflare:workers';
import { seedState, publicState, adminState, publicActions, adminActions, expirePending, sendReminders, lateStartAlerts, UserError, uid, nowISO, ROLES } from './core.js';

const COLLS = ['guides', 'users', 'bookings', 'unavail'];
const COUNTERS = ['rotSeq', 'lastGuideId', 'seq', 'lastReminder'];
const KEEP = 300; // จำนวน log / แจ้งเตือนล่าสุดที่ถือไว้ในหน่วยความจำ
const SESSION_DAYS = 7;

/* ----- รหัสผ่าน: PBKDF2-SHA256 ----- */
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function pbkdf2(pw, salt, iter) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256);
}
export async function hashPw(pw) { const salt = crypto.getRandomValues(new Uint8Array(16)); return `pbkdf2$100000$${b64(salt)}$${b64(await pbkdf2(pw, salt, 100000))}` }
export async function verifyPw(pw, stored) {
  if (!stored) return false; const [, it, s, h] = stored.split('$'); const got = b64(await pbkdf2(pw, unb64(s), +it));
  let d = got.length ^ h.length; for (let i = 0; i < Math.min(got.length, h.length); i++) d |= got.charCodeAt(i) ^ h.charCodeAt(i); return d === 0;
}
const json = (o, status = 200, headers = {}) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } });
const cookieOf = (req, name) => (req.headers.get('cookie') || '').split(/;\s*/).map(x => x.split('=')).find(([k]) => k === name)?.[1];

export class Engine extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env); this.env = env; this.sql = ctx.storage.sql; this.db = null; this.cache = null; this.fails = new Map();
    this.sql.exec(`CREATE TABLE IF NOT EXISTS docs(coll TEXT, id TEXT, json TEXT, PRIMARY KEY(coll,id));
      CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, json TEXT);
      CREATE TABLE IF NOT EXISTS audit(n INTEGER PRIMARY KEY AUTOINCREMENT, json TEXT);
      CREATE TABLE IF NOT EXISTS notif(id TEXT PRIMARY KEY, n INTEGER, json TEXT);
      CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, userId TEXT, exp INTEGER);`);
  }

  /* ----- โหลด / บันทึก ----- */
  /* การจองที่เลยเวลาชำระ (ยังไม่แนบสลิป) → ยกเลิกเป็น "หมดเวลาชำระเงิน" และคืนรอบให้ว่าง */
  async expireDue() {
    const db = await this.load(), now = nowISO();
    if (db.bookings.some(b => b.status === 'pending' && !b.slip && b.expiresAt && b.expiresAt < now)) await this.run({ id: '-', name: 'ระบบ', role: 'system' }, d => expirePending(d));
  }
  stateFor(db, actor) {
    const st = { ...adminState(db, actor), lineReady: !!(this.env.LINE_CHANNEL_TOKEN && this.env.LINE_CHANNEL_SECRET) };
    if (actor.role === 'guide' && actor.guideId) { // กล่องแจ้งเตือนของไกด์: ดึงจากฐานข้อมูลโดยตรง (ย้อนหลังได้ไกลกว่า log ในหน่วยความจำ)
      try { st.notifications = this.sql.exec(`SELECT json FROM notif WHERE json_extract(json,'$.to') = ? ORDER BY n DESC LIMIT 100`, 'guide:' + actor.guideId).toArray().map(r => JSON.parse(r.json)).map(n => ({ id: n.id, at: n.at, title: n.title, body: n.body, message: n.message, kind: n.kind || '', from: n.fromName || '', url: n.url || '' })) } catch (e) { }
    }
    return st;
  }
  async load() {
    if (this.db) return this.db;
    const meta = Object.fromEntries(this.sql.exec('SELECT k,json FROM meta').toArray().map(r => [r.k, JSON.parse(r.json)]));
    if (!meta.settings) { // ครั้งแรก: สร้างข้อมูลตั้งต้น + ผู้ดูแลระบบ
      const db = seedState();
      if (this.env.ADMIN_PASSWORD) db.users.push({ id: 'u' + uid(), username: this.env.ADMIN_USERNAME || 'admin', pw: await hashPw(this.env.ADMIN_PASSWORD), name: 'ผู้ดูแลระบบ', role: 'superadmin', active: true });
      this.db = db; this.cache = { meta: {}, docs: {} }; COLLS.forEach(c => this.cache.docs[c] = new Map()); this.persist(); return this.db;
    }
    const db = { settings: meta.settings, site: meta.site, ...meta.counters };
    this.cache = { meta: { settings: JSON.stringify(meta.settings), site: JSON.stringify(meta.site), counters: JSON.stringify(meta.counters) }, docs: {} };
    COLLS.forEach(c => { db[c] = []; this.cache.docs[c] = new Map() });
    for (const r of this.sql.exec('SELECT coll,id,json FROM docs')) { if (db[r.coll]) { db[r.coll].push(JSON.parse(r.json)); this.cache.docs[r.coll].set(r.id, r.json) } }
    db.bookings.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    db.audit = this.sql.exec(`SELECT json FROM audit ORDER BY n DESC LIMIT ${KEEP}`).toArray().map(r => JSON.parse(r.json));
    db.notifications = this.sql.exec(`SELECT json FROM notif ORDER BY n DESC LIMIT ${KEEP}`).toArray().map(r => JSON.parse(r.json));
    this.db = db;
    if (db.settings.vehicleFee === undefined) { db.settings.vehicleFee = 30; this.persist() } // ค่ารถเข้าอุทยาน (ค่าเริ่มต้น)
    if (db.users.some(u => !u.no)) this.persist();
    if (!db.settings.slotV2) { db.settings.slotStep = 15; db.settings.slotV2 = true; this.persist() } // ปรับรอบเป็นทุก 15 นาที (ครั้งเดียว)
    if (!db.users.length && this.env.ADMIN_PASSWORD) { db.users.push({ id: 'u' + uid(), username: this.env.ADMIN_USERNAME || 'admin', pw: await hashPw(this.env.ADMIN_PASSWORD), name: 'ผู้ดูแลระบบ', role: 'superadmin', active: true }); this.persist() }
    return db;
  }
  persist() {
    const db = this.db, c = this.cache;
    { let m = Math.max(0, ...db.users.map(u => +u.no || 0)); db.users.forEach(u => { if (!u.no) u.no = ++m }) } // รหัสผู้ใช้ (ID) เรียงตามลำดับที่สร้าง
    const counters = Object.fromEntries(COUNTERS.map(k => [k, db[k] ?? null]));
    for (const [k, v] of [['settings', db.settings], ['site', db.site], ['counters', counters]]) {
      const s = JSON.stringify(v); if (c.meta[k] !== s) { this.sql.exec('INSERT OR REPLACE INTO meta(k,json) VALUES(?,?)', k, s); c.meta[k] = s }
    }
    for (const coll of COLLS) {
      const seen = new Set();
      for (const o of db[coll]) { const s = JSON.stringify(o); seen.add(o.id); if (c.docs[coll].get(o.id) !== s) { this.sql.exec('INSERT OR REPLACE INTO docs(coll,id,json) VALUES(?,?,?)', coll, o.id, s); c.docs[coll].set(o.id, s) } }
      for (const id of [...c.docs[coll].keys()]) if (!seen.has(id)) { this.sql.exec('DELETE FROM docs WHERE coll=? AND id=?', coll, id); c.docs[coll].delete(id) }
    }
    for (const a of db.$audit || []) { this.sql.exec('INSERT INTO audit(json) VALUES(?)', JSON.stringify(a)); db.audit.unshift(a) }
    for (const n of db.$notify || []) { this.saveNotif(n, true); db.notifications.unshift(n) }
    db.audit.length = Math.min(db.audit.length, KEEP); db.notifications.length = Math.min(db.notifications.length, KEEP);
  }
  saveNotif(n, insert) {
    if (insert) { const m = this.sql.exec('SELECT COALESCE(MAX(n),0)+1 AS m FROM notif').one().m; n._n = m; this.sql.exec('INSERT INTO notif(id,n,json) VALUES(?,?,?)', n.id, m, JSON.stringify(n)) }
    else this.sql.exec('UPDATE notif SET json=? WHERE id=?', JSON.stringify(n), n.id);
  }
  /* รันคำสั่งแบบ all-or-nothing: ถ้าผิดพลาดกลางทาง ทิ้งสถานะในหน่วยความจำแล้วโหลดใหม่จาก SQLite */
  async run(actor, fn) {
    const db = await this.load(); db.$actor = actor; db.$audit = []; db.$notify = [];
    try {
      const out = await fn(db);
      this.persist(); const pending = db.$notify; db.$audit = []; db.$notify = [];
      if (pending.length) this.ctx.waitUntil(this.deliver(pending));
      return out;
    } catch (e) { this.db = null; this.cache = null; throw e }
  }

  /* ----- ส่งแจ้งเตือนจริง: LINE Messaging API + อีเมล (Resend) ----- */
  async deliver(list) {
    const env = this.env;
    for (const n of list) {
      try {
        if (n.channel === 'line') {
          if (!env.LINE_CHANNEL_TOKEN) n.status = 'ยังไม่ได้ตั้งค่า LINE OA';
          else if (!n.to) n.status = 'ไกด์ยังไม่ได้ผูก LINE กับ OA';
          else { const r = await fetch('https://api.line.me/v2/bot/message/push', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${env.LINE_CHANNEL_TOKEN}` }, body: JSON.stringify({ to: n.to, messages: [{ type: 'text', text: n.message }] }) }); n.status = r.ok ? 'ส่งแล้ว' : `ส่งไม่สำเร็จ (${r.status})` }
        } else if (n.channel === 'push') {
          n.status = await this.pushDeliver(n);
        } else if (n.channel === 'email') {
          if (!env.RESEND_API_KEY || !env.MAIL_FROM) n.status = 'ยังไม่ได้ตั้งค่าอีเมล';
          else { const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${env.RESEND_API_KEY}` }, body: JSON.stringify({ from: env.MAIL_FROM, to: [n.to], subject: n.subject || '[ผาแง่ม] แจ้งเตือน', text: n.message }) }); n.status = r.ok ? 'ส่งแล้ว' : `ส่งไม่สำเร็จ (${r.status})` }
        }
      } catch (e) { n.status = 'ส่งไม่สำเร็จ (' + (e.message || 'error') + ')' }
      this.saveNotif(n, false);
    }
  }

  /* ----- แจ้งเตือนในแอป (Web Push แบบไม่มี payload + กล่องข้อความ) ----- */
  async vapid() {
    let v = await this.ctx.storage.get('vapid');
    if (!v) {
      const k = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
      v = { pub: b64u(await crypto.subtle.exportKey('raw', k.publicKey)), jwk: await crypto.subtle.exportKey('jwk', k.privateKey) };
      await this.ctx.storage.put('vapid', v);
    }
    return v;
  }
  async pushDeliver(n) {
    const db = await this.load(), t = String(n.to || '');
    const users = t.startsWith('guide:') ? db.users.filter(u => u.active && u.guideId === t.slice(6))
      : t.startsWith('roles:') ? db.users.filter(u => u.active && t.slice(6).split(',').includes(u.role))
      : t.startsWith('user:') ? db.users.filter(u => u.active && u.id === t.slice(5)) : [];
    const subs = (await this.ctx.storage.get('pushsubs')) || [], mine = subs.filter(x => users.some(u => u.id === x.userId));
    if (!mine.length) return users.length ? 'ยังไม่ได้เปิดแจ้งเตือนในแอป' : t.startsWith('guide:') ? 'ไกด์ยังไม่มีบัญชีเข้าแอป' : 'ไม่มีผู้รับ';
    const item = { id: uid(), title: n.title || 'ผาแง่ม', body: n.body || n.message || '', url: n.url || '/#admin', at: nowISO() };
    for (const u of users) { const k = 'inbox:' + u.id, box = (await this.ctx.storage.get(k)) || []; box.push(item); await this.ctx.storage.put(k, box.slice(-20)) }
    let ok = 0; const dead = [];
    for (const sub of mine) { const st = await this.webPush(sub.endpoint).catch(() => 0); if (st >= 200 && st < 300) ok++; else if (st === 404 || st === 410) dead.push(sub.endpoint) }
    if (dead.length) await this.ctx.storage.put('pushsubs', subs.filter(x => !dead.includes(x.endpoint)));
    return ok ? `ส่งแล้ว (${ok} เครื่อง)` : 'ส่งไม่สำเร็จ';
  }
  async webPush(endpoint) {
    const v = await this.vapid(), aud = new URL(endpoint).origin;
    const h = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' })), p = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: 'https://phangamtrail.com' }));
    const key = await crypto.subtle.importKey('jwk', v.jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    const sig = b64u(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(h + '.' + p)));
    const r = await fetch(endpoint, { method: 'POST', headers: { TTL: '86400', Urgency: 'high', Authorization: `vapid t=${h}.${p}.${sig}, k=${v.pub}`, 'Content-Length': '0' } });
    return r.status;
  }

  /* ----- เซสชัน ----- */
  async actorOf(req) {
    const t = cookieOf(req, 'pg_sess'); if (!t) return null;
    const s = this.sql.exec('SELECT userId,exp FROM sessions WHERE token=?', t).toArray()[0]; if (!s || s.exp < Date.now()) return null;
    const db = await this.load(); const u = db.users.find(x => x.id === s.userId && x.active); return u ? { id: u.id, name: u.name, role: u.role, guideId: u.guideId || null, username: u.username } : null;
  }
  sessionCookie(token, maxAge) { return `pg_sess=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}` }

  /* ----- เส้นทางภายใน (worker.js ส่งต่อมา) ----- */
  async fetch(req) {
    const url = new URL(req.url), path = url.pathname;
    try {
      if (path.startsWith('/api/public/') || path.startsWith('/api/admin/')) await this.expireDue(); // หมดเวลาชำระ → คืนรอบทันที ไม่ต้องรอ cron
      if (path === '/api/public/state') { const db = await this.load(); return json(publicState(db)) }
      if (path.startsWith('/api/public/')) {
        const name = path.slice(12), fn = publicActions[name]; if (!fn || req.method !== 'POST') return json({ error: 'not found' }, 404);
        const p = await req.json().catch(() => ({}));
        if (name === 'createBooking') { // จำกัดความถี่ต่อ IP แบบง่าย
          const ip = req.headers.get('cf-connecting-ip') || '-', k = 'bk:' + ip, f = this.fails.get(k) || { n: 0, t: Date.now() };
          if (Date.now() - f.t > 3600e3) { f.n = 0; f.t = Date.now() } if (++f.n > 20) return json({ error: 'ทำรายการบ่อยเกินไป กรุณาลองใหม่ภายหลัง' }, 429); this.fails.set(k, f);
        }
        const out = await this.run({ id: '-', name: 'ลูกค้า', role: 'public' }, db => fn(db, p)); return json(out);
      }
      if (path === '/api/auth/login' && req.method === 'POST') {
        const p = await req.json().catch(() => ({})), username = String(p.username || '').trim(), k = 'lg:' + username.toLowerCase(), f = this.fails.get(k);
        if (f && f.n >= 5 && Date.now() - f.t < 10 * 60e3) return json({ error: 'ใส่รหัสผิดหลายครั้ง กรุณารอ 10 นาที' }, 429);
        const db = await this.load(); const u = db.users.find(x => x.username === username && x.active);
        if (!u || !await verifyPw(String(p.password || ''), u.pw)) { this.fails.set(k, { n: (f && Date.now() - f.t < 10 * 60e3 ? f.n : 0) + 1, t: Date.now() }); return json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' }, 401) }
        this.fails.delete(k);
        const token = [...crypto.getRandomValues(new Uint8Array(32))].map(b => b.toString(16).padStart(2, '0')).join('');
        this.sql.exec('INSERT INTO sessions(token,userId,exp) VALUES(?,?,?)', token, u.id, Date.now() + SESSION_DAYS * 86400e3);
        this.sql.exec('DELETE FROM sessions WHERE exp<?', Date.now());
        await this.run({ id: u.id, name: u.name, role: u.role }, db => { db.$audit.push({ id: uid(), at: nowISO(), userId: u.id, userName: u.name, action: 'login', detail: `เข้าสู่ระบบ (${u.username})` }) });
        return json({ ok: true }, 200, { 'set-cookie': this.sessionCookie(token, SESSION_DAYS * 86400) });
      }
      if (path === '/api/auth/logout') { const t = cookieOf(req, 'pg_sess'); if (t) this.sql.exec('DELETE FROM sessions WHERE token=?', t); return json({ ok: true }, 200, { 'set-cookie': this.sessionCookie('', 0) }) }
      if (path === '/api/push/key') return json({ key: (await this.vapid()).pub });
      if (path.startsWith('/api/push/')) {
        const a = await this.actorOf(req); if (!a) return json({ error: 'กรุณาเข้าสู่ระบบ' }, 401);
        const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
        if (path === '/api/push/subscribe') {
          const ep = String(body.endpoint || ''); if (!/^https:\/\//.test(ep) || ep.length > 1000) return json({ error: 'ข้อมูลไม่ถูกต้อง' }, 400);
          const subs = ((await this.ctx.storage.get('pushsubs')) || []).filter(x => x.endpoint !== ep);
          subs.push({ userId: a.id, endpoint: ep, ua: String(req.headers.get('user-agent') || '').slice(0, 120), at: nowISO() }); await this.ctx.storage.put('pushsubs', subs.slice(-500));
          return json({ ok: true, msg: 'เปิดแจ้งเตือนในเครื่องนี้แล้ว' });
        }
        if (path === '/api/push/unsubscribe') { const subs = ((await this.ctx.storage.get('pushsubs')) || []).filter(x => x.endpoint !== body.endpoint); await this.ctx.storage.put('pushsubs', subs); return json({ ok: true }) }
        if (path === '/api/push/status') { const subs = ((await this.ctx.storage.get('pushsubs')) || []).filter(x => x.userId === a.id); return json({ count: subs.length, endpoints: subs.map(x => x.endpoint) }) }
        if (path === '/api/push/inbox') { const k = 'inbox:' + a.id, box = (await this.ctx.storage.get(k)) || []; await this.ctx.storage.delete(k); return json({ items: box }) }
        if (path === '/api/push/test') return json({ msg: await this.pushDeliver({ to: 'user:' + a.id, title: '🔔 ทดสอบแจ้งเตือน', body: 'แอปผาแง่มรับแจ้งเตือนในเครื่องนี้ได้แล้ว ✅', url: '/#admin-me' }) });
        return json({ error: 'not found' }, 404);
      }
      if (path === '/api/auth/me') { const a = await this.actorOf(req); return json({ me: a, pages: a ? ROLES[a.role].pages : [] }) }
      if (path === '/api/auth/status') { const db = await this.load(); return json({ hasUsers: db.users.length > 0 }) }

      if (path.startsWith('/api/admin/')) {
        const actor = await this.actorOf(req); if (!actor) return json({ error: 'กรุณาเข้าสู่ระบบ' }, 401);
        if (path === '/api/admin/state') { const db = await this.load(); return json(this.stateFor(db, actor)) }
        const name = path.slice(11), fn = adminActions[name]; if (!fn || req.method !== 'POST') return json({ error: 'not found' }, 404);
        const p = await req.json().catch(() => ({}));
        const out = await this.run(actor, db => fn(db, p, { hash: hashPw, verify: verifyPw }));
        const db = await this.load(); return json({ ...out, state: this.stateFor(db, actor) });
      }
      if (path === '/internal/can') { // worker ถามสิทธิ์ก่อนอัปโหลดรูป
        const actor = await this.actorOf(req); return json({ actor });
      }
      if (path === '/internal/tick') {
        const out = await this.run({ id: '-', name: 'ระบบ', role: 'system' }, db => ({ expired: expirePending(db), reminded: sendReminders(db), late: lateStartAlerts(db) }));
        return json(out);
      }
      if (path === '/internal/line') return this.lineEvents(await req.json());
      return json({ error: 'not found' }, 404);
    } catch (e) {
      if (e instanceof UserError) return json({ error: e.message }, e.status || 400);
      console.error(e); return json({ error: 'เกิดข้อผิดพลาดในระบบ' }, 500);
    }
  }

  /* ----- LINE webhook: ไกด์พิมพ์เบอร์โทรใน OA เพื่อผูกบัญชีรับแจ้งเตือน ----- */
  async lineEvents(body) {
    const replies = [];
    await this.run({ id: '-', name: 'LINE OA', role: 'system' }, db => {
      for (const ev of body.events || []) {
        const userId = ev.source?.userId; if (!userId || !ev.replyToken) continue;
        const by = db.settings.lineLinkBy || 'both', how = { phone: '“เบอร์โทรศัพท์”', name: '“ชื่อ นามสกุล”', both: '“เบอร์โทรศัพท์” หรือ “ชื่อ นามสกุล”' }[by] || 'เบอร์โทรศัพท์';
        if (ev.type === 'follow') { replies.push([ev.replyToken, `สวัสดีครับ ไกด์ผาแง่มพิมพ์ ${how} ที่ลงทะเบียนไว้ เพื่อผูกบัญชีและรับแจ้งเตือนงานนำเที่ยว`]); continue }
        if (ev.type !== 'message' || ev.message?.type !== 'text') continue;
        const text = ev.message.text.trim(), digits = text.replace(/\D/g, '');
        const norm = t => String(t || '').toLowerCase().replace(/^(นาย|นางสาว|นาง|น\.ส\.|mr\.?|mrs\.?|ms\.?|miss)\s*/i, '').replace(/[\s.]+/g, '');
        let g = null, err = '';
        const qr = /^ผูก\s*LINE/i.test(text); // ข้อความจาก QR ผูก LINE รายคน: "ผูก LINE: ชื่อ นามสกุล เบอร์"
        if (qr) {
          g = db.guides.find(x => x.active !== false && (x.phone || '').replace(/\D/g, '') === digits) || null;
          if (!g) err = 'ไม่พบไกด์ตามข้อมูลใน QR (อาจถูกแก้ไขเบอร์โทรแล้ว) กรุณาขอ QR ใหม่จากผู้จัดการไกด์';
        } else
        if (by !== 'name' && digits.length >= 9 && digits.length >= text.replace(/\s/g, '').length - 2) {
          g = db.guides.find(x => x.active !== false && (x.phone || '').replace(/\D/g, '') === digits) || null;
          if (!g) err = 'ไม่พบเบอร์นี้ในรายชื่อไกด์';
        } else if (by !== 'phone') {
          const k = norm(text), m = k.length >= 3 ? db.guides.filter(x => x.active !== false && norm(`${x.firstName}${x.lastName}`) === k) : [];
          if (m.length === 1) g = m[0]; else err = m.length > 1 ? 'พบไกด์ชื่อนี้มากกว่า 1 คน กรุณาพิมพ์เบอร์โทรแทน' : 'ไม่พบชื่อ-นามสกุลนี้ในรายชื่อไกด์ (พิมพ์ชื่อและนามสกุลให้ตรงกับที่ลงทะเบียน)';
        } else err = 'กรุณาพิมพ์เบอร์โทรศัพท์ที่ลงทะเบียนไว้';
        if (g) {
          db.guides.forEach(x => { if (x !== g && x.lineUserId === userId) x.lineUserId = '' });
          g.lineUserId = userId; db.$audit.push({ id: uid(), at: nowISO(), userId: '-', userName: 'LINE OA', action: 'guide', detail: `ผูก LINE กับไกด์ ${g.firstName} ${g.lastName}` });
          replies.push([ev.replyToken, `ผูกบัญชีสำเร็จ ✅ คุณ${g.firstName} ${g.lastName} จะได้รับแจ้งเตือนงานนำเที่ยวผ่าน LINE นี้`]);
        } else replies.push([ev.replyToken, `${err} — กรุณาพิมพ์ ${how} ให้ตรงกับที่ลงทะเบียน หรือติดต่อผู้จัดการไกด์`]);
      }
    });
    if (this.env.LINE_CHANNEL_TOKEN) for (const [replyToken, text] of replies)
      await fetch('https://api.line.me/v2/bot/message/reply', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${this.env.LINE_CHANNEL_TOKEN}` }, body: JSON.stringify({ replyToken, messages: [{ type: 'text', text }] }) }).catch(() => { });
    return json({ ok: true });
  }
}

function b64u(x) { const b = typeof x === 'string' ? new TextEncoder().encode(x) : new Uint8Array(x); let s = ''; b.forEach(c => s += String.fromCharCode(c)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') }
