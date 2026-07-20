# Guía de despliegue de OJAM

Todo el despliegue usa capas gratuitas: Supabase (base de datos + auth),
Cloudflare Pages (frontend) y Render (backend). No se necesita dominio
propio para empezar — ver [dominio.md](dominio.md).

> Cloudflare Pages se eligió por su red con fuerte presencia en Latinoamérica
> (mejor latencia para conexiones rurales débiles) y ancho de banda sin tope,
> lo que deja abierta la evolución futura a teselas propias auto-alojadas
> (PMTiles + R2). Netlify o Vercel siguen sirviendo igual: ver la nota al
> final de la sección 3 si prefieres alguno de ellos.

## 1. Supabase (base de datos + autenticación)

1. Crea un proyecto en [supabase.com](https://supabase.com) (plan Free).
2. Aplica las migraciones **en orden** desde el SQL Editor
   (Database → SQL Editor → pega y ejecuta cada archivo):
   1. `supabase/migrations/0001_schema.sql` — PostGIS, enums, tablas, vistas, funciones.
   2. `supabase/migrations/0002_rls.sql` — RLS y permisos (la protección del
      contacto de quien reporta vive aquí).
   3. `supabase/migrations/0003_triggers.sql` — auditoría automática e inmutable.
   4. `supabase/migrations/0004_seed_categorias.sql` — 2 categorías de ejemplo.

   > Alternativa con CLI: `supabase link --project-ref <ref>` y `supabase db push`.

3. **Cuenta de administración**: Authentication → Users → *Add user* →
   email + contraseña. Ese email va en la variable `ADMIN_EMAIL`.
4. **Desactiva el registro público**: Authentication → Sign In / Up →
   desmarca *Allow new users to sign up*. (El backend además valida el email
   contra `ADMIN_EMAIL`, pero mejor cerrar la puerta desde el origen.)
5. Anota de Settings → API:
   - `Project URL` → `SUPABASE_URL`
   - `anon public` → `SUPABASE_ANON_KEY`
   - `service_role` → `SUPABASE_SERVICE_ROLE_KEY` (⚠️ solo para el backend,
     jamás en el frontend ni en el repositorio).

## 2. Backend (Render)

1. En [render.com](https://render.com): *New → Web Service* → conecta el repo.
2. Configuración:
   - **Root Directory**: `backend`
   - **Build command**: `npm install`
   - **Start command**: `npm start`
   - **Instance type**: Free
3. Variables de entorno (Environment):
   ```
   SUPABASE_URL=...
   SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...
   ADMIN_EMAIL=correo@delequipo.org        # admite varios, separados por coma
   PUBLIC_URL=https://TU-SITIO.pages.dev   # la(s) URL(s) del frontend (CORS)
   ```
4. Al terminar, Render asigna una URL tipo `https://ojam-backend.onrender.com`.
   Verifica `https://.../salud` → `{"ok":true}`.

> Nota del plan Free de Render: el servicio "duerme" tras 15 minutos sin
> tráfico y la primera petición siguiente tarda ~30-60 s. La PWA amortigua
> esto mostrando los últimos datos cacheados mientras despierta.

## 3. Frontend (Cloudflare Pages)

1. Edita `frontend/js/config.js`:
   - `API_URL` → la URL de Render del paso anterior.
   - `SUPABASE_URL` y `SUPABASE_ANON_KEY` → los del paso 1 (son públicos por
     diseño; la seguridad real la da RLS).
2. En [dash.cloudflare.com](https://dash.cloudflare.com) → *Workers & Pages* →
   *Create* → pestaña **Pages** → *Connect to Git* → elige el repositorio.
   Configura:
   - **Framework preset**: None.
   - **Build command**: (déjalo vacío — el sitio es estático, sin build).
   - **Build output directory**: `frontend`.

   El archivo `frontend/_headers` del repo ya aplica las cabeceras de caché
   (service worker sin cachear, librerías inmutables, assets a una semana).
3. Cloudflare asigna una URL tipo `https://ojam.pages.dev`. Es un sitio público
   real con HTTPS: sirve para pruebas, socialización comunitaria y demos.
4. **Vuelve a Render** y confirma que `PUBLIC_URL` contiene exactamente esa URL
   (sin barra final). Puedes listar varias separadas por coma.

> **¿Prefieres Netlify o Vercel?** El repo trae también `netlify.toml`
> (`publish = "frontend"`) y el mismo `_headers` funciona en Netlify. En Vercel:
> *Add New Project*, framework "Other", **Output Directory** = `frontend`, sin
> build. En cualquier caso, ajusta `PUBLIC_URL` en Render a la URL que te den.

## 4. Verificación de la PWA

1. Abre el sitio en un teléfono Android (Chrome): menú → *Agregar a pantalla
   de inicio*. Debe instalarse con el ícono de OJAM.
2. Con la app abierta, activa el modo avión y recárgala: el cascarón y las
   zonas del mapa ya visitadas deben seguir visibles.
3. Envía un reporte en modo avión: debe avisar que quedó guardado y enviarse
   solo al volver la señal.

## 5. Prueba de humo completa

1. `/(mapa)` carga y muestra las 2 categorías de ejemplo con contador `[0]`.
2. «Agregar tu injusticia» → enviar un reporte de prueba → aparece el aviso
   de cola de revisión.
3. `/admin.html` → ingresar → el reporte está en *Cola de pendientes* →
   aprobar → aparece en el mapa público (recargar).
4. «Descargar datos» entrega CSV/GeoJSON solo con casos aprobados y **sin**
   columna de contacto.
5. En admin → Exportar → el CSV completo sí incluye estado, canal y contacto.

## Costes

Todo lo anterior: **$0**. Los únicos costes futuros posibles son el dominio
`.org` (trámite aparte) y, si el proyecto crece mucho, salir de las capas
gratuitas de Supabase/Render.
