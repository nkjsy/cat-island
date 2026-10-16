// 猫猫小岛 offline support.
// Everything from this site (the page, the cat model, music and meows) is fetched from the network first,
// so an update always reaches players, and falls back to the cached copy when offline.
// Libraries and fonts from CDNs have fixed version URLs, so they are served from the cache first.
const CACHE = 'maomao-v7';
const CORE = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png',
  './cat_model.js',
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/utils/SkeletonUtils.js'];

self.addEventListener('install', e=>{
  e.waitUntil(caches.open(CACHE).then(c=>Promise.all(CORE.map(u=>c.add(new Request(u, u.startsWith('http') ? {mode:'cors'} : {})).catch(()=>{})))).then(()=>self.skipWaiting()));
});
self.addEventListener('activate', e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch', e=>{
  const req = e.request; if(req.method !== 'GET') return;
  const url = new URL(req.url), page = req.mode === 'navigate' || url.origin === location.origin;
  if(page){
    // network first: always try for the newest files, keep a copy for offline play
    e.respondWith(fetch(req).then(res=>{ if(res.ok){ const copy = res.clone(); caches.open(CACHE).then(c=>c.put(url.search ? new Request(url.pathname) : req, copy)); } return res; })
      .catch(()=>caches.match(req, {ignoreSearch:true}).then(r=>r || caches.match('./'))));
    return;
  }
  // everything else: cache first, then network (and remember it)
  e.respondWith(caches.match(req).then(hit=>hit || fetch(req).then(res=>{ if(res && (res.ok || res.type==='opaque')){ const copy = res.clone(); caches.open(CACHE).then(c=>c.put(req, copy)); } return res; })));
});
