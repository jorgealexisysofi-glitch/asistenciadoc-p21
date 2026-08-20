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

// --- Registros de asistencia sin conexión -----------------------------------
// El manejo offline lo hace la app (cola local en localStorage con la hora real
// del registro, ver src/lib/colaOffline.ts). Así funciona también en iPhone y
// el registro conserva la hora en que ocurrió, no la de sincronización.

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

// --- Web Push: mostrar el recordatorio recibido -----------------------------
interface PushPayload {
  title?: string
  body?: string
  url?: string
  tag?: string
}

self.addEventListener('push', (event: PushEvent) => {
  let datos: PushPayload = {}
  try {
    if (event.data) datos = event.data.json() as PushPayload
  } catch {
    if (event.data) datos = { body: event.data.text() }
  }
  event.waitUntil(
    self.registration.showNotification(datos.title ?? 'Asistencia Prepa 21', {
      body: datos.body ?? '',
      icon: '/icons/icon-app.png',
      tag: datos.tag,
      data: { url: datos.url ?? '/validar' },
    })
  )
})

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close()
  const url = (event.notification.data?.url as string) || '/'
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientes) => {
        for (const cliente of clientes) {
          if ('focus' in cliente) {
            void (cliente as WindowClient).navigate(url)
            return (cliente as WindowClient).focus()
          }
        }
        return self.clients.openWindow(url)
      })
  )
})

// --- Red de seguridad: si una navegación falla por completo, mostrar la
//     página "Sin conexión" precacheada en lugar del error del navegador.
setCatchHandler(async ({ request }) => {
  if (request.mode === 'navigate') {
    return (await matchPrecache('offline.html')) ?? Response.error()
  }
  return Response.error()
})
