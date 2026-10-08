'use strict';

// Change this version whenever the app shell changes. Activation removes only
// older Simple Mind Map caches; localStorage and unrelated caches are untouched.
const CACHE_PREFIX = 'simple-mind-map-';
const CACHE_NAME = 'simple-mind-map-app-v21-1';
const REQUIRED_SHELL = [
  './',
  './index.html',
  './style.css?v=21',
  './script.js?v=21',
  './manifest.webmanifest',
];
const OPTIONAL_SHELL = [
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

async function cachePath(cache,path) {
  const request = new Request(new URL(path,self.registration.scope),{cache:'reload'});
  const response = await fetch(request);
  if (!response.ok) throw Error(`Precache failed: ${path}`);
  await cache.put(request,response);
}

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache = await caches.open(CACHE_NAME);
    try {
      // Keep the previous complete worker active unless every core file is ready.
      await Promise.all(REQUIRED_SHELL.map(path=>cachePath(cache,path)));
      await Promise.allSettled(OPTIONAL_SHELL.map(path=>cachePath(cache,path)));
    } catch (error) {
      await caches.delete(CACHE_NAME);
      throw error;
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const names = await caches.keys();
    await Promise.all(names
      .filter(name=>name.startsWith(CACHE_PREFIX) && name!==CACHE_NAME)
      .map(name=>caches.delete(name)));
    await self.clients.claim();
  })());
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request,response.clone());
    return response;
  } catch (error) {
    return (await cache.match(request,{ignoreSearch:true}))
      || (await cache.match(new URL('./index.html',self.registration.scope).href))
      || (await cache.match(new URL('./',self.registration.scope).href))
      || Response.error();
  }
}

async function staleWhileRevalidate(request,event) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request,{ignoreSearch:false});
  const update = fetch(request).then(async response=>{
    if (response.ok) await cache.put(request,response.clone());
    return response;
  });
  if (cached) {
    event.waitUntil(update.catch(()=>undefined));
    return cached;
  }
  try { return await update; }
  catch (error) { return Response.error(); }
}

self.addEventListener('fetch',event=>{
  const {request} = event;
  if (request.method!=='GET') return;
  const url = new URL(request.url);
  if (url.origin!==self.location.origin) return;
  if (request.mode==='navigate') {
    event.respondWith(networkFirst(request));
    return;
  }
  if (['style','script','image','manifest'].includes(request.destination)) {
    event.respondWith(staleWhileRevalidate(request,event));
  }
});
