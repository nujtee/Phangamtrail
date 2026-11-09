// จุดเข้าหลักของ Worker: หน้าเว็บ (static assets), API → Durable Object, รูปภาพ → R2, LINE webhook, cron
export { Engine } from './engine.js';
import { PERM } from './core.js';

const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
const engine = env => env.ENGINE.get(env.ENGINE.idFromName('main'));
const IMG_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_IMG = 5 * 1024 * 1024;

async function actorOf(req, env) {
  const r = await engine(env).fetch(new Request('https://do/internal/can', { headers: { cookie: req.headers.get('cookie') || '' } }));
  return (await r.json()).actor;
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url), path = url.pathname;

    // บังคับใช้โดเมนหลัก (www → ไม่มี www)
    if (url.hostname === 'www.' + (env.MAIN_HOST || '')) { url.hostname = env.MAIN_HOST; return Response.redirect(url.toString(), 301) }

    // อัปโหลดรูปเนื้อหาเว็บ / QR ช่องทางชำระ (เฉพาะผู้มีสิทธิ์)
    if (path === '/api/admin/upload' && req.method === 'POST') {
      const actor = await actorOf(req, env); if (!actor) return json({ error: 'กรุณาเข้าสู่ระบบ' }, 401);
      if (![...PERM.content, ...PERM.payments].includes(actor.role)) return json({ error: 'ไม่มีสิทธิ์อัปโหลด' }, 403);
      const type = req.headers.get('content-type') || '', ext = IMG_TYPES[type.split(';')[0]];
      if (!ext) return json({ error: 'รองรับเฉพาะไฟล์ JPG / PNG / WEBP' }, 400);
      const body = await req.arrayBuffer(); if (body.byteLength > MAX_IMG) return json({ error: 'ไฟล์ใหญ่เกิน 5 MB' }, 400);
      const key = `site/${crypto.randomUUID()}.${ext}`;
      await env.IMAGES.put(key, body, { httpMetadata: { contentType: type, cacheControl: 'public, max-age=31536000, immutable' } });
      return json({ url: '/img/' + key });
    }

    // ไกด์ถ่ายรูปกลุ่มก่อนเริ่มเดินทาง (ดูได้เฉพาะผู้ที่ล็อกอิน)
    if (path === '/api/admin/trip-photo' && req.method === 'POST') {
      const actor = await actorOf(req, env); if (!actor) return json({ error: 'กรุณาเข้าสู่ระบบ' }, 401);
      if (![...PERM.tripAdmin, 'guide'].includes(actor.role)) return json({ error: 'ไม่มีสิทธิ์' }, 403);
      const type = req.headers.get('content-type') || '', ext = IMG_TYPES[type.split(';')[0]];
      if (!ext) return json({ error: 'รองรับเฉพาะไฟล์รูป' }, 400);
      const body = await req.arrayBuffer(); if (body.byteLength > MAX_IMG) return json({ error: 'ไฟล์ใหญ่เกิน 5 MB' }, 400);
      const key = `trips/${crypto.randomUUID()}.${ext}`; await env.IMAGES.put(key, body, { httpMetadata: { contentType: type } });
      return json({ url: '/img/' + key });
    }
    if (path === '/api/public/slip') return json({ error: 'not found' }, 404); // ใช้ผ่าน slip-upload เท่านั้น
    // ลูกค้าแนบสลิป (ตรวจรหัสจอง + เบอร์โทรที่ engine)
    if (path === '/api/public/slip-upload' && req.method === 'POST') {
      const fd = await req.formData().catch(() => null); const file = fd?.get('file');
      if (!file || typeof file === 'string') return json({ error: 'กรุณาเลือกไฟล์' }, 400);
      const ext = IMG_TYPES[file.type]; if (!ext) return json({ error: 'รองรับเฉพาะไฟล์รูป JPG / PNG / WEBP' }, 400);
      if (file.size > MAX_IMG) return json({ error: 'ไฟล์ใหญ่เกิน 5 MB' }, 400);
      const code = String(fd.get('code') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const key = `slips/${code}-${crypto.randomUUID()}.${ext}`;
      const buf = await file.arrayBuffer();
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map(x => x.toString(16).padStart(2, '0')).join('');
      const qr = String(fd.get('qr') || '').trim().slice(0, 512);
      await env.IMAGES.put(key, buf, { httpMetadata: { contentType: file.type } });
      let verify = null;
      if (qr && env.SLIPOK_API_KEY && env.SLIPOK_BRANCH_ID) verify = await slipokVerify(env, qr);
      const r = await engine(env).fetch(new Request('https://do/api/public/slip', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, phone: fd.get('phone'), channel: fd.get('channel'), url: '/img/' + key, hash, qr, verify }) }));
      if (!r.ok) ctx.waitUntil(env.IMAGES.delete(key));
      return r;
    }

    // รูปภาพจาก R2 (สลิปดูได้เฉพาะเจ้าหน้าที่)
    if (path.startsWith('/img/')) {
      const key = decodeURIComponent(path.slice(5));
      if (key.startsWith('slips/')) { const a = await actorOf(req, env); if (!a || a.role === 'guide') return new Response('forbidden', { status: 403 }) }
      if (key.startsWith('trips/')) { const a = await actorOf(req, env); if (!a) return new Response('forbidden', { status: 403 }) }
      const pub = !key.startsWith('slips/') && !key.startsWith('trips/'), cache = caches.default, ck = new Request(url.origin + path);
      if (pub) { const hit = await cache.match(ck); if (hit) return hit } // แคชที่ edge ของ Cloudflare
      const obj = await env.IMAGES.get(key); if (!obj) return new Response('not found', { status: 404 });
      const h = new Headers(); obj.writeHttpMetadata(h); h.set('etag', obj.httpEtag);
      if (!pub) { h.set('cache-control', 'private, no-store'); return new Response(obj.body, { headers: h }) }
      h.set('cache-control', 'public, max-age=31536000, immutable'); // ชื่อไฟล์เป็น UUID ไม่เปลี่ยน → แคชได้ยาว
      const res = new Response(obj.body, { headers: h }); ctx.waitUntil(cache.put(ck, res.clone())); return res;
    }

    // LINE Messaging API webhook (ตรวจลายเซ็น)
    if (path === '/line/webhook' && req.method === 'POST') {
      const body = await req.text();
      if (!env.LINE_CHANNEL_SECRET) return new Response('not configured', { status: 503 });
      const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.LINE_CHANNEL_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const sig = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)))));
      if (sig !== req.headers.get('x-line-signature')) return new Response('bad signature', { status: 401 });
      return engine(env).fetch(new Request('https://do/internal/line', { method: 'POST', body }));
    }

    if (path.startsWith('/api/')) {
      if (req.method === 'POST') { // กัน CSRF: คำขอที่เปลี่ยนข้อมูลต้องมาจากโดเมนเดียวกัน
        const origin = req.headers.get('origin'); if (origin && new URL(origin).host !== url.host) return json({ error: 'forbidden' }, 403);
      }
      return engine(env).fetch(req);
    }
    if (path.startsWith('/internal/')) return new Response('not found', { status: 404 });

    // หน้าเว็บ
    let res = await env.ASSETS.fetch(req);
    if ((path === '/' || path === '/index.html') && req.method === 'GET' && (res.headers.get('content-type') || '').includes('text/html')) {
      // ฝังข้อมูลหน้าเว็บไว้ใน HTML เลย → ไม่ต้องรอคำขอแยก (เร็วขึ้น และไม่ติดส่วนขยายเบราว์เซอร์ที่บล็อกคำขอเบื้องหลัง)
      const st = await Promise.race([engine(env).fetch(new Request('https://do/api/public/state')).then(r => r.ok ? r.text() : null).catch(() => null), new Promise(r => setTimeout(() => r(null), 2500))]);
      if (st) {
        const safe = st.replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
        res = new HTMLRewriter().on('head', { element(e) { e.append(`<script>window.__PUB=${safe}</script>`, { html: true }) } }).transform(res);
      }
      const h0 = new Headers(res.headers); h0.set('cache-control', 'no-store'); res = new Response(res.body, { status: res.status, headers: h0 });
    }
    const h = new Headers(res.headers);
    h.set('x-content-type-options', 'nosniff'); h.set('referrer-policy', 'strict-origin-when-cross-origin'); h.set('x-frame-options', 'SAMEORIGIN');
    return new Response(res.body, { status: res.status, headers: h });
  },

  // ทุก 5 นาที: ยกเลิกการจองที่ไม่ชำระตามเวลา และส่งเตือนไกด์ 18:00 คืนก่อนเดินป่า
  async scheduled(event, env, ctx) {
    ctx.waitUntil(engine(env).fetch(new Request('https://do/internal/tick', { method: 'POST' })));
  },
};

/* ตรวจสลิปกับ SlipOK (ใช้เมื่อช่องทางตั้งเป็น "ออโต้" และตั้งค่า SLIPOK_API_KEY + SLIPOK_BRANCH_ID) */
async function slipokVerify(env, qr) {
  try {
    const r = await fetch(`https://api.slipok.com/api/line/apikey/${env.SLIPOK_BRANCH_ID}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-authorization': env.SLIPOK_API_KEY }, body: JSON.stringify({ data: qr, log: true }) });
    const j = await r.json().catch(() => ({}));
    const d = j.data || {};
    if (r.ok && j.success && d.success !== false) return { ok: true, amount: +d.amount || 0, ref: d.transRef || '', msg: 'ตรวจสลิปผ่าน' };
    return { ok: false, amount: +d.amount || 0, ref: d.transRef || '', msg: j.message || `ตรวจสลิปไม่ผ่าน (${j.code || r.status})` };
  } catch (e) { return { ok: false, amount: 0, ref: '', msg: 'ติดต่อระบบตรวจสลิปไม่ได้' } }
}
