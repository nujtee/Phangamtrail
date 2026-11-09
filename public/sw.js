/* Service worker — แอปไกด์ผาแง่ม */
const V = 'pg-v1', SHELL = '/';
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll([SHELL, '/icon-192.png'])).catch(() => {})); self.skipWaiting() });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())) });
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;
  // หน้าเว็บ: ใช้เน็ตก่อน ถ้าไม่มีสัญญาณใช้ฉบับที่เก็บไว้
  if (r.mode === 'navigate') { e.respondWith(fetch(r).then(res => { const c = res.clone(); caches.open(V).then(x => x.put(SHELL, c)); return res }).catch(() => caches.match(SHELL))); return }
  // ข้อมูลงาน (หลังบ้าน): ใช้เน็ตก่อน เก็บสำเนาไว้ดูตอนออฟไลน์
  if (u.pathname === '/api/admin/state' || u.pathname === '/api/auth/me') { e.respondWith(fetch(r).then(res => { if (res.ok) { const c = res.clone(); caches.open(V).then(x => x.put(u.pathname, c)) } return res }).catch(() => caches.match(u.pathname))); return }
});
self.addEventListener('push', e => {
  e.waitUntil((async () => {
    let items = [];
    try { const r = await fetch('/api/push/inbox', { credentials: 'include' }); if (r.ok) items = (await r.json()).items || [] } catch (_) {}
    if (!items.length) items = [{ title: 'ผาแง่ม', body: 'มีการอัปเดตงาน แตะเพื่อดูรายละเอียด', url: '/#admin-today' }];
    await Promise.all(items.slice(-3).map(it => self.registration.showNotification(it.title || 'ผาแง่ม', { body: it.body || '', icon: '/icon-192.png', badge: '/icon-192.png', tag: it.id || undefined, data: { url: it.url || '/#admin-today' } })));
  })());
});
self.addEventListener('notificationclick', e => {
  e.notification.close(); const url = (e.notification.data && e.notification.data.url) || '/#admin-today';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => { for (const c of cs) { if ('focus' in c) { c.navigate(url).catch(() => {}); return c.focus() } } return self.clients.openWindow(url) }));
});
