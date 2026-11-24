/* Service worker: ให้แอปเปิดได้เร็ว/ออฟไลน์หลังเข้าครั้งแรก
   เปลี่ยน VERSION เมื่อแก้ไฟล์ app shell เพื่อล้างแคชเก่า */
const VERSION = "v1";
const SHELL_CACHE = "shell-" + VERSION;
const IMG_CACHE = "img-" + VERSION;
const MAX_IMAGES = 220;

const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./data.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(async (cache) => {
      // ใส่ทีละไฟล์ เพื่อไม่ให้ไฟล์เดียวพลาดแล้ว install ล้มทั้งชุด
      await Promise.all(
        SHELL.map((url) =>
          fetch(url, { cache: "reload" })
            .then((res) => (res && res.ok ? cache.put(url, res) : null))
            .catch(() => null)
        )
      );
      await self.skipWaiting();
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== SHELL_CACHE && k !== IMG_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.destination === "image" || /\.(webp|png|jpe?g|svg)$/i.test(url.pathname)) {
    event.respondWith(cacheFirst(req, IMG_CACHE, true));
  } else {
    event.respondWith(networkFirst(req, SHELL_CACHE));
  }
});

async function cacheFirst(req, cacheName, trim) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;

  try {
    const res = await fetch(req);
    if (res && res.ok) {
      await cache.put(req, res.clone());
      if (trim) trimCache(cache, MAX_IMAGES);
    }
    return res;
  } catch (err) {
    return hit || Response.error();
  }
}

async function trimCache(cache, max) {
  const keys = await cache.keys();
  if (keys.length <= max) return;
  const extra = keys.length - max;
  for (let i = 0; i < extra; i++) await cache.delete(keys[i]);
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req);
    if (hit) return hit;
    if (req.mode === "navigate") {
      const fallback = await cache.match("./index.html");
      if (fallback) return fallback;
    }
    return Response.error();
  }
}
