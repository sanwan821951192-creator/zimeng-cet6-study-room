'use strict';
const CACHE='zimeng-public-assets-v1';
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url),scope=new URL(self.registration.scope);
  if(request.method!=='GET'||url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname))return;
  const filename=url.pathname.slice(scope.pathname.length);
  const immutable=/^(?:data-home-|lesson-day-|lesson-extra-|lesson-dictionary-).+-[a-f0-9]{12}\.js$/.test(filename)
    ||/^data-home-[a-f0-9]{12}\.js$/.test(filename)
    ||/^lesson-dictionary-[a-f0-9]{12}\.js$/.test(filename)
    ||/^lesson-extra-[a-f0-9]{12}\.js$/.test(filename)
    ||/^dictionary-fast-v1-[a-f0-9]{2}\.js$/.test(filename)
    ||/\.(?:js|css)$/.test(filename)&&/^[a-f0-9]{12}$/.test(url.searchParams.get('v')||'');
  if(!immutable)return;
  event.respondWith((async()=>{
    let cache;try{cache=await caches.open(CACHE);const hit=await cache.match(request);if(hit)return hit;}catch{}
    const response=await fetch(request);
    if(response.ok&&cache){const copy=response.clone();event.waitUntil((async()=>{
      try{await cache.put(request,copy);const keys=await cache.keys();for(const old of keys.slice(0,Math.max(0,keys.length-180)))await cache.delete(old);}catch{}
    })());}
    return response;
  })());
});
