// Service worker สำหรับแอปมือถือ (index.html) เท่านั้น — ทำ 2 อย่าง:
//  1) ให้ผ่านเกณฑ์ "ติดตั้งเป็นแอป" (installable PWA) ของเบราว์เซอร์
//  2) แคชไฟล์เปลือกแอป (shell) ที่ไม่ได้ใช้ร่วมกับหน้าอื่น
//
// จงใจ "ไม่" แคช config.js/sync.js เพราะ 2 ไฟล์นี้ใช้ร่วมกับ office.html —
// ถ้าแคชไว้ หลัง deploy ครั้งถัดไปหน้าออฟฟิศอาจได้โค้ดเก่าค้างอยู่โดยไม่ตั้งใจ
// ไฟล์อื่นนอกลิสต์ SHELL (office.html, Firebase, Google Sheet, React/Babel
// จาก CDN ฯลฯ) จึงทำงานตามปกติเหมือนไม่มี service worker อยู่เลย
const CACHE = 'carphoto-shell-v1';
const SHELL = ['index.html', 'manifest.json',
  'icons/icon-192.png', 'icons/icon-512.png',
  'icons/icon-maskable-192.png', 'icons/icon-maskable-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // ปล่อยผ่านทุกโดเมนนอก (Firebase/CDN/ฟอนต์ ฯลฯ)
  const isShellFile = SHELL.some((p) => url.pathname.endsWith('/' + p) || url.pathname === '/' + p);
  if (!isShellFile) return; // ปล่อยผ่าน office.html และไฟล์อื่นที่ไม่ใช่เปลือกแอป

  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
