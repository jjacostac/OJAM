# Migrar de subdominio temporal a dominio propio

El dominio `.org` de OJAM depende de un trámite legal con la universidad y
puede tardar. **No es un bloqueante**: el proyecto se desarrolla, despliega y
socializa completo en las URLs gratuitas (`*.pages.dev`, `*.onrender.com`).

Cuando el dominio esté listo, la migración es **solo configuración** — cero
cambios de código:

## Pasos

1. **Frontend (Cloudflare Pages)**: proyecto de Pages → *Custom domains* →
   *Set up a domain* → `ojam.org` (y `www.ojam.org` si se quiere). Si el
   dominio ya usa Cloudflare como DNS, los registros se crean solos; si no,
   Cloudflare indica el `CNAME` a crear donde esté registrado el dominio. El
   certificado HTTPS se emite solo.
2. **Backend (Render)**: Environment → editar `PUBLIC_URL`:
   ```
   PUBLIC_URL=https://ojam.pages.dev,https://ojam.org
   ```
   (Deja la URL temporal unos días durante la transición; luego puedes
   retirarla.) Render redespliega automáticamente al guardar.
3. Listo. No hay que tocar `manifest.webmanifest` ni el service worker: usan
   rutas **relativas** precisamente para que la PWA funcione igual en
   cualquier dominio.

## Por qué funciona sin cambios de código

- El frontend nunca conoce su propio dominio: los assets y el manifest usan
  rutas relativas.
- El backend valida CORS contra la variable de entorno `PUBLIC_URL`, no contra
  una lista escrita en el código (`backend/src/server.js`).
- Las personas que instalaron la PWA desde la URL temporal seguirán viéndola
  funcionar (la URL vieja no se rompe mientras no borres el proyecto de Pages);
  simplemente las nuevas instalaciones llegarán por el dominio propio.

## Si el backend también recibe dominio propio (opcional)

Por ejemplo `api.ojam.org` apuntando a Render (Custom Domains en Render):
actualiza `API_URL` en `frontend/js/config.js` y redespliega el frontend.
Es el único punto del frontend que conoce al backend.
