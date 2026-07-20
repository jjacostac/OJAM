# OJAM — Observatorio de Justicia Ambiental del Magdalena

Observatorio ciudadano de **código abierto** para reportar y visualizar conflictos
ambientales georreferenciados en el departamento del Magdalena (Colombia).

> **Este repositorio es una plantilla.** Contiene la estructura, el código, el
> estilo visual y la configuración — **nunca datos reales de reportes**. Cualquier
> equipo puede adoptarlo para otro departamento o país: ver
> [docs/replicacion.md](docs/replicacion.md).

## Principios de diseño

- **Ligereza como requisito de arquitectura**: pensado para señal de celular débil
  o intermitente en zonas rurales. Sin frameworks de frontend, tipografía del
  sistema, Leaflet como única dependencia de mapa (~150 KB), carga inicial total
  < 100 KB gzip sin contar teselas.
- **Calidad visual sin recortes**: estilo cartográfico inspirado en
  [EJAtlas](https://ejatlas.org/country/colombia) y estructura de filtros de
  [OCA UNAL](https://conflictosambientales.unal.edu.co/oca/).
- **Funciona sin señal**: PWA con service worker (la app y las zonas del mapa ya
  vistas abren offline) y cola local de reportes que se reenvía sola al volver
  la conexión.
- **La privacidad vive en la base de datos**: el contacto de quien reporta está
  protegido con RLS de Postgres, no solo con lógica de aplicación.

## Arquitectura

```
[Ciudadanía] → Frontend estático PWA (Cloudflare Pages, sin login)
                    │
                    ▼
              API REST (Node/Express en Render)
                    │
                    ▼
        Supabase (Postgres + PostGIS + Auth)
                    ▲
[Equipo admin] → admin.html (Supabase Auth) → rutas /api/admin/*
                    ▲
[Canal WhatsApp] → transcripción manual desde el panel admin
```

| Capa | Tecnología |
|---|---|
| Frontend | HTML/CSS/JS vanilla + Leaflet + OpenStreetMap, empaquetado como PWA |
| Backend | Node.js + Express (API REST) |
| Base de datos | PostgreSQL + PostGIS en Supabase (capa gratuita) |
| Autenticación | Supabase Auth (solo panel de administración) |
| Hosting | Cloudflare Pages (frontend) + Render (backend), capas gratuitas |

## Estructura del repositorio

```
frontend/    → PWA: mapa público, formulario de reporte, panel admin
backend/     → API Express (rutas públicas y protegidas)
supabase/    → migraciones SQL (esquema, RLS, triggers, semilla) — sin datos
scripts/     → utilidades (generación de íconos PWA)
docs/        → despliegue, replicación, migración de dominio
.env.example → variables de entorno necesarias (sin valores reales)
```

## Puesta en marcha rápida (desarrollo local)

Requisitos: Node 18+, una cuenta gratuita en [Supabase](https://supabase.com).

1. **Clona el repositorio** y crea tu proyecto en Supabase.
2. **Aplica las migraciones** de `supabase/migrations/` en orden (SQL Editor de
   Supabase o CLI `supabase db push`). Detalle en [docs/despliegue.md](docs/despliegue.md).
3. **Crea la cuenta admin** en Supabase → Authentication → Add user
   (email + contraseña) y **desactiva el registro público** (Sign ups).
4. **Backend**:
   ```bash
   cp .env.example backend/.env    # completa los valores
   cd backend && npm install && npm run dev
   ```
5. **Frontend**: edita `frontend/js/config.js` (URL del backend y credenciales
   públicas de Supabase) y sirve la carpeta con el servidor incluido
   (solo requiere Node, sin instalar nada):
   ```bash
   node scripts/servidor-local.mjs
   ```
6. Abre `http://localhost:5173` (mapa público) y `/admin.html` (panel).

## Documentación

- **[docs/despliegue.md](docs/despliegue.md)** — despliegue completo en
  Supabase + Cloudflare Pages + Render, paso a paso.
- **[docs/replicacion.md](docs/replicacion.md)** — cómo adaptar OJAM a otro
  departamento o país (GeoJSON propio, textos, categorías).
- **[docs/dominio.md](docs/dominio.md)** — migrar del subdominio temporal
  gratuito al dominio propio `.org` **sin cambios de código**.

## Fuentes de datos y licencias

- Límites municipales: **DANE — Marco Geoestadístico Nacional 2018**
  (servicio ArcGIS `MGN_MPIO_POLITICO_DANE`), filtrados para Magdalena y
  simplificados con [mapshaper](https://mapshaper.org) (~47 KB gzip).
- Mapa base: © colaboradores de [OpenStreetMap](https://www.openstreetmap.org/copyright);
  variante de bajo consumo: teselas [CARTO](https://carto.com/attributions).
- Datos publicados por el observatorio: licencia
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.es).
- Código: licencia MIT.

## Decisiones de alcance (v1)

- Sin fotos ni archivos adjuntos: el reporte es texto + ubicación GPS.
- Sin captcha en el formulario público (decisión explícita); el abuso se
  mitiga con rate-limiting en el backend.
- La integración con WhatsApp es manual: el equipo admin transcribe los
  mensajes desde el panel (`canal_origen = whatsapp`, con trazabilidad).
- GitHub aloja **solo el código**: la base de datos vive en Supabase.
