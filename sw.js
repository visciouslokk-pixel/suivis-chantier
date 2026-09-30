const CACHE='suivis-chantier-shell-v9';
const ROOT=new URL('./',self.location.href);
const FILES=['./','index.html','style.css','app.js','action-ui.js','model.js','store.js','backup.js','postit.html','postit.js','postit-model.js','postit.css','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png'].map(p=>new URL(p,ROOT).href);
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('suivis-chantier-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||!FILES.includes(event.request.url))return;
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)));
});
