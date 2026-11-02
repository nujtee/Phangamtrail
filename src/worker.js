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
      const r = await engine(env).fetch(new Request('https://do/api/public/slip', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, phone: fd.get('phone'), channel: fd.get('channel'), url: '/img/' + key, hash, qr }) }));
      if (!r.ok) ctx.waitUntil(env.IMAGES.delete(key));
      return r;
    }

    // รูปภาพจาก R2 (สลิปดูได้เฉพาะเจ้าหน้าที่)
    if (path.startsWith('/img/')) {
      const key = decodeURIComponent(path.slice(5));
      if (key.startsWith('slips/')) { const a = await actorOf(req, env); if (!a || a.role === 'guide') return new Response('forbidden', { status: 403 }) }
      const obj = await env.IMAGES.get(key); if (!obj) return new Response('not found', { status: 404 });
      const h = new Headers(); obj.writeHttpMetadata(h); h.set('etag', obj.httpEtag);
      if (key.startsWith('slips/')) h.set('cache-control', 'private, no-store');
      return new Response(obj.body, { headers: h });
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
    const res = await env.ASSETS.fetch(req);
    const h = new Headers(res.headers);
    h.set('x-content-type-options', 'nosniff'); h.set('referrer-policy', 'strict-origin-when-cross-origin'); h.set('x-frame-options', 'SAMEORIGIN');
    return new Response(res.body, { status: res.status, headers: h });
  },

  // ทุก 5 นาที: ยกเลิกการจองที่ไม่ชำระตามเวลา และส่งเตือนไกด์ 18:00 คืนก่อนเดินป่า
  async scheduled(event, env, ctx) {
    ctx.waitUntil(engine(env).fetch(new Request('https://do/internal/tick', { method: 'POST' })));
  },
};
