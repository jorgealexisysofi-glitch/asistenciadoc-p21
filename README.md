# AsistenciaDoc P21 🎓

PWA de control de asistencia docente para la **Preparatoria 21 · Universidad de Guadalajara**.

Cada aula tiene un **ESP32** que emite una señal única (WiFi SSID o nombre Bluetooth).
Cuando el profesor entra al aula con su móvil, la app detecta esa señal y valida
automáticamente su asistencia; si no hay señal, puede registrarse manualmente con un PIN.

Construida con **React 18 + Vite + TypeScript**, **Supabase** (Auth + Postgres + RLS),
**Tailwind CSS**, **React Router v6** y **vite-plugin-pwa** (instalable y offline-first).

---

## 1. Requisitos

- Node.js 20+ y npm
- Una cuenta de [Supabase](https://supabase.com) (plan gratuito sirve)
- Para desplegar: una cuenta de [Vercel](https://vercel.com) + `npm i -g vercel`

## 2. Instalación local

```bash
npm install
npm run dev          # http://localhost:5173
```

La app arranca aunque Supabase no esté configurado (el login muestra un aviso).

## 3. Variables de entorno

Copia `.env.example` a `.env` y rellena:

| Variable | Dónde se obtiene | Obligatoria |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API → Project URL | ✅ |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → anon public | ✅ |
| `VITE_ADMIN_EMAIL_DOMAIN` | Dominio cuyos correos son admin en la UI (opcional) | ⬜ |

> El acceso real a los datos lo decide **RLS** en la base, no estas variables.

## 4. Configuración de Supabase

1. Crea un proyecto en Supabase.
2. En **SQL Editor**, ejecuta [`supabase/schema.sql`](supabase/schema.sql). Crea las tablas
   (`profesores`, `aulas`, `materias`, `horarios`, `registros_asistencia`), la RPC
   `get_horario_activo`, las políticas RLS, los triggers y datos de prueba.
3. **Primer admin** — registra/invita tu usuario en Authentication → Users y luego:
   ```sql
   update public.profesores set admin = true, user_id =
     (select id from auth.users where email = 'tu-correo@academicos.udg.mx')
   where correo = 'tu-correo@academicos.udg.mx';
   ```
   (o asigna `app_metadata.rol = 'admin'` desde el dashboard).
4. **Alta de profesores con cuenta automática** (opcional pero recomendado) — despliega la
   Edge Function que crea el usuario de Auth y envía el correo de bienvenida:
   ```bash
   supabase functions deploy crear-profesor
   ```
   Sin ella, el panel crea la ficha y deberás invitar el correo manualmente desde
   Authentication → Users → Invite.

## 5. Rutas

| Ruta | Página | Acceso |
| --- | --- | --- |
| `/` | Login (correo + contraseña, recuperación) | Público |
| `/home` | Inicio del profesor: próxima clase, historial, aviso de clase | Sesión |
| `/validar` | Detección de beacon + registro (auto o manual con PIN) | Sesión |
| `/admin` | Dashboard: KPIs, tabla del día, filtros, export CSV | Rol `admin` |
| `/admin/profesores` | Alta/edición de profesores y sus horarios | Rol `admin` |
| `/admin/reportes` | Resumen por profesor en un rango de fechas | Rol `admin` |
| `/admin/aulas` | Gestión de aulas y sus beacons ESP32 | Rol `admin` |

## 6. Scripts

| Comando | Descripción |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción (type-check + service worker) |
| `npm run preview` | Sirve el build (para probar la PWA instalable y el SW) |
| `npm run deploy` | `vite build && vercel --prod` |
| `npm run icons` | Regenera los iconos PWA en `public/icons/` |

## 7. PWA y modo offline

- **Instalable**: aparece un banner «Instalar app»; en iOS usa *Compartir → Añadir a inicio*.
- **Service worker** ([`src/sw.ts`](src/sw.ts), Workbox vía injectManifest):
  - **CacheFirst** para assets estáticos (JS, CSS, fuentes, imágenes).
  - **NetworkFirst** para la API de Supabase (lecturas), con caché de respaldo.
  - **Background Sync** para los registros de asistencia: si no hay red, el POST se
    encola en IndexedDB y se reenvía solo al reconectar.
  - **Offline fallback**: el app shell está precacheado (la app abre sin conexión) y
    [`public/offline.html`](public/offline.html) es la red de seguridad.

## 8. Despliegue en Vercel

[`vercel.json`](vercel.json) ya incluye los rewrites SPA (todas las rutas → `/index.html`)
y headers de seguridad (CSP, X-Frame-Options, X-Content-Type-Options, HSTS, Permissions-Policy).

```bash
vercel                # primer despliegue (configura el proyecto)
# Añade VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en Project → Settings → Environment Variables
npm run deploy        # despliegue a producción
```

> La CSP permite conexiones a `*.supabase.co`. Si usas un dominio propio de Supabase,
> ajústalo en `connect-src` dentro de `vercel.json`.

---

## 9. Programar el ESP32 (beacon de aula)

Cada aula necesita un ESP32 que anuncie un identificador **único** que coincida con el
campo `beacon_id` de la tabla `aulas` (configurable desde `/admin/aulas`).

### Opción A — Beacon WiFi (SSID, `beacon_tipo = 'wifi'`)

El ESP32 crea un Access Point cuyo SSID es el `beacon_id`. Es el modo más compatible:
cualquier teléfono ve la red, aunque la detección automática del SSID desde el navegador
no es posible (se valida manualmente confirmando que la red está visible).

```cpp
#include <WiFi.h>

const char* SSID_AULA = "P21-BEACON-A101";  // == aulas.beacon_id

void setup() {
  WiFi.mode(WIFI_AP);
  // SSID visible, sin contraseña (solo sirve como "faro" de presencia)
  WiFi.softAP(SSID_AULA);
}

void loop() {
  delay(1000);
}
```

### Opción B — Beacon Bluetooth LE (`beacon_tipo = 'bluetooth'`)

El ESP32 anuncia su nombre por BLE; el `beacon_id` debe ser ese nombre. Este modo **sí**
permite detección automática vía Web Bluetooth en Chrome/Edge para Android.

```cpp
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLEAdvertising.h>

const char* NOMBRE_AULA = "P21-BEACON-LABC";  // == aulas.beacon_id

void setup() {
  BLEDevice::init(NOMBRE_AULA);
  BLEServer* server = BLEDevice::createServer();
  // Servicio mínimo solo para anunciarse
  server->createService(BLEUUID((uint16_t)0x1801));
  BLEAdvertising* adv = BLEDevice::getAdvertising();
  adv->setScanResponse(true);
  BLEDevice::startAdvertising();
}

void loop() {
  delay(1000);
}
```

### Pasos de instalación

1. **Arduino IDE** → instala el soporte de placas *esp32* (Boards Manager).
2. Selecciona tu placa (p. ej. *ESP32 Dev Module*) y el puerto COM.
3. Pega el sketch, ajusta `SSID_AULA` / `NOMBRE_AULA` con un identificador único por aula
   (convención sugerida: `P21-BEACON-<AULA>`).
4. Sube el sketch al ESP32 y aliméntalo dentro del aula (USB o fuente 5 V).
5. En la app, entra como admin a **`/admin/aulas`**, crea o edita el aula y captura el
   mismo valor en **Beacon ID** y el **tipo** (WiFi o Bluetooth).
6. Asigna horarios al aula desde **`/admin/profesores`**. Cuando un profesor tenga clase
   ahí, al abrir **`/validar`** la app buscará ese beacon y habilitará el registro.

> **Notas de compatibilidad**
> - Web Bluetooth requiere **Chrome/Edge en Android** y conexión **HTTPS** (lo que Vercel
>   ya provee). iOS/Safari no soporta Web Bluetooth: en esos casos se usa el registro
>   manual con PIN.
> - Los navegadores no exponen el escaneo de redes WiFi; el modo WiFi sirve como faro
>   visible y se valida manualmente. Para detección WiFi 100 % automática haría falta una
>   app nativa.

---

## 10. Identidad visual

- Naranja UdeG `#E87722` (primario) · Azul UdeG `#003DA5` (secundario)
- Fondos `#FFFFFF` / `#F7F7F7` · Tipografía **Inter**
- Diseño mobile-first; toasts de feedback y skeleton loaders durante la carga.
