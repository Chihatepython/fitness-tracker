const CACHE_NAME = 'fitness-tracker-app-shell'
const BASE_URL = new URL('./', self.location.href).pathname
const PRECACHE_URLS = [
  BASE_URL,
  `${BASE_URL}manifest.webmanifest`,
  `${BASE_URL}icons/icon-192.png`,
  `${BASE_URL}icons/icon-512.png`,
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((cacheName) => cacheName.startsWith('fitness-tracker-'))
            .filter((cacheName) => cacheName !== CACHE_NAME)
            .map((cacheName) => caches.delete(cacheName)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  const requestUrl = new URL(request.url)

  if (request.method !== 'GET' || requestUrl.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const responseCopy = response.clone()
          void caches.open(CACHE_NAME).then((cache) => cache.put(BASE_URL, responseCopy))
          return response
        })
        .catch(() => caches.match(BASE_URL)),
    )
    return
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse

      return fetch(request).then((response) => {
        if (!response.ok) return response

        const responseCopy = response.clone()
        void caches.open(CACHE_NAME).then((cache) => cache.put(request, responseCopy))
        return response
      })
    }),
  )
})
