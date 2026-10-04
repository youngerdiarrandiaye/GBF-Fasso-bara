// Service worker GFB-STOCK — installabilité PWA + cache des assets statiques.
// Volontairement PAS de cache des pages HTML ni des requêtes Supabase
// (API auth/data) : l'app manipule du stock/facturation en temps réel, un
// affichage périmé serait pire qu'une absence de mode hors-ligne.
const CACHE_NAME = "gfb-stock-static-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

function estAssetStatiqueMemeOrigine(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static/") ||
      url.pathname.startsWith("/icons/") ||
      url.pathname === "/favicon.ico")
  );
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (!estAssetStatiqueMemeOrigine(url)) return;

  // Stale-while-revalidate : sert le cache immédiatement, revalide en fond.
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request);
      const fetchPromise = fetch(event.request)
        .then((response) => {
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        })
        .catch(() => cached);
      return cached ?? fetchPromise;
    })
  );
});
