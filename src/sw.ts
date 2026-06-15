/// <reference lib="webworker" />
// Service worker personalizado de AsistenciaDoc (estrategia injectManifest).
// - Precache del app shell (todas las rutas del SPA se sirven desde index.html)
// - CacheFirst para assets estáticos (JS, CSS, fuentes)
// - NetworkFirst para lecturas a la API de Supabase
// - Background Sync para los registros de asistencia creados sin conexión
import { clientsClaim } from 'workbox-core'
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching'
import { NavigationRoute, registerRoute, setCatchHandler } from 'workbox-routing'
import { matchPrecache } from 'workbox-precaching'
import { CacheFirst, NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { ExpirationPlugin } from 'workbox-expiration'
import { BackgroundSyncPlugin } from 'workbox-background-sync'

declare const self: ServiceWorkerGlobalScope

self.skipWaiting()
clientsClaim()

// --- Precache (inyectado por vite-plugin-pwa en tiempo de build) ------------
cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// --- Navegación SPA: servir index.html precacheado (la app funciona offline)
const handler = createHandlerBoundToURL('index.html')
registerRoute(new NavigationRoute(handler, { denylist: [/^\/api/, /\/auth\/v1\//] }))

// --- Fuentes de Google -------------------------------------------------------
registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com',
  new StaleWhileRevalidate({ cacheName: 'google-fonts-stylesheets' })
)
registerRoute(
  ({ url }) => url.origin === 'https://fonts.gstatic.com',
  new CacheFirst({
    cacheName: 'google-fonts-webfonts',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 }),
    ],
  })
)

// --- Assets estáticos: CacheFirst -------------------------------------------
registerRoute(
  ({ request }) =>
    ['style', 'script', 'worker', 'font'].includes(request.destination),
  new CacheFirst({
    cacheName: 'assets-estaticos',
    plugins: [new CacheableResponsePlugin({ statuses: [0, 200] })],
  })
)
registerRoute(
  ({ request }) => request.destination === 'image',
  new CacheFirst({
    cacheName: 'imagenes',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 }),
    ],
  })
)

// --- Background Sync: registros de asistencia creados sin conexión ----------
// Encola los POST a registros_asistencia y los reenvía cuando vuelve la red.
const colaAsistencia = new BackgroundSyncPlugin('asistencia-sync', {
  maxRetentionTime: 24 * 60, // minutos (reintenta hasta 24 h)
})

registerRoute(
  ({ url, request }) =>
    request.method === 'POST' &&
    (url.pathname.includes('/rest/v1/registros_asistencia') ||
      url.pathname.includes('/rest/v1/rpc/registrar_asistencia')),
  new NetworkFirst({ cacheName: 'asistencia-post', plugins: [colaAsistencia] }),
  'POST'
)

// --- Resto de la API de Supabase (lecturas): NetworkFirst -------------------
registerRoute(
  ({ url, request }) =>
    request.method === 'GET' &&
    (url.pathname.startsWith('/rest/v1/') || url.pathname.startsWith('/auth/v1/')),
  new NetworkFirst({
    cacheName: 'supabase-api',
    networkTimeoutSeconds: 10,
    plugins: [new CacheableResponsePlugin({ statuses: [0, 200] })],
  })
)

// --- Red de seguridad: si una navegación falla por completo, mostrar la
//     página "Sin conexión" precacheada en lugar del error del navegador.
setCatchHandler(async ({ request }) => {
  if (request.mode === 'navigate') {
    return (await matchPrecache('offline.html')) ?? Response.error()
  }
  return Response.error()
})
