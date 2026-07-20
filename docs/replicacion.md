# Replicar OJAM en otro departamento o país

El repositorio es una plantilla sin datos: todo lo específico del Magdalena
está concentrado en unos pocos puntos. Para montar un observatorio gemelo:

## 1. Clona y crea tu propia infraestructura

- Haz *fork* o *Use this template* del repositorio.
- Crea **tu propio proyecto Supabase** y aplica las migraciones
  (ver [despliegue.md](despliegue.md) §1). Las migraciones no contienen datos
  del Magdalena: solo estructura y 2 categorías de ejemplo que puedes editar.

## 2. Reemplaza los límites administrativos (GeoJSON)

El mapa dibuja `frontend/assets/geo/municipios-magdalena.geojson`. Para tu
territorio necesitas un GeoJSON equivalente con una propiedad `nombre` por
polígono (alimenta las etiquetas del mapa y los selectores de municipio).

Ejemplo de cómo se generó el del Magdalena (Colombia, fuente DANE):

```bash
# 1. Descargar los municipios del servicio oficial ArcGIS del DANE
curl "https://services.arcgis.com/wLfHepIACaM0pwj9/arcgis/rest/services/MGN_MPIO_POLITICO_DANE/FeatureServer/0/query?where=DPTO_CCDGO%3D%2747%27&outFields=DPTO_CCDGO,MPIO_CCDGO,MPIO_CNMBR&outSR=4326&f=geojson" -o crudo.geojson

# 2. Simplificar (bajar de ~8 MB a ~180 KB sin perder forma visible)
npx mapshaper crudo.geojson -simplify weighted 4% keep-shapes -clean \
  -filter-fields MPIO_CCDGO,MPIO_CNMBR \
  -o limites.geojson precision=0.0001 format=geojson

# 3. Renombrar propiedades a {codigo, nombre} (ver scripts en el historial
#    del repo) y guardar como frontend/assets/geo/<tu-region>.geojson

# 4. Generar el contorno del territorio (halo neón del mapa):
npx mapshaper frontend/assets/geo/<tu-region>.geojson -dissolve \
  -each 'nombre="TuRegion"' \
  -o frontend/assets/geo/<tu-region>-contorno.geojson precision=0.0001 format=geojson
```

Para otros países: [geoBoundaries](https://www.geoboundaries.org) (CC BY) o
el instituto geográfico/estadístico nacional. **Documenta la fuente exacta**
en tu README, como hace este repo con el DANE.

Luego actualiza en `frontend/js/config.js`:
- `ARCHIVO_LIMITES` → ruta del nuevo archivo.
- `MAPA.centro` y `MAPA.zoom` → encuadre inicial de tu territorio.
- (El mapa igualmente se auto-encuadra a los límites al cargar.)

Y agrega el archivo a la lista `CASCARON` de `frontend/sw.js`.

## 3. Identidad

- `frontend/js/config.js`: `NOMBRE_CORTO` y `NOMBRE_LARGO`.
- `frontend/index.html`: título, descripción y textos del encabezado/pie.
- `frontend/assets/logo.svg`: reemplaza el placeholder (gota + hoja).
- `frontend/assets/partners/*.svg`: logos de tus instituciones aliadas.
- `frontend/manifest.webmanifest`: nombre de la app instalable.
- Íconos PWA: reemplaza los PNG o regenera con `node scripts/generar-iconos.mjs`.

## 4. Categorías (tipos de injusticia)

No toques código: entra a `/admin.html` → Categorías y crea las tuyas con su
color. El mapa, la leyenda, los filtros y el formulario se alimentan de la
tabla `categorias` automáticamente.

## 5. Despliega

Sigue [despliegue.md](despliegue.md) con tus propias cuentas de Cloudflare
Pages y Render, y configura tu dominio cuando lo tengas ([dominio.md](dominio.md)).

## Qué NO debes subir nunca a tu repositorio público

- `.env` o cualquier archivo con la `service_role key`.
- Exportaciones de la base (`ojam-completo-*.csv`, etc.).
- Datos personales de reportantes. El `.gitignore` ya cubre los casos comunes,
  pero la responsabilidad final es del equipo que replica.
