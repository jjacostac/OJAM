// ============================================================
// CONFIGURACIÓN DEL DESPLIEGUE — único archivo que se edita al
// desplegar en otro entorno u otro departamento/país.
//
// La URL del backend NO se hardcodea en el resto del código:
// todo pasa por aquí. Ver docs/despliegue.md y docs/dominio.md.
// ============================================================

const esLocal = ['localhost', '127.0.0.1'].includes(location.hostname);

export const CONFIG = {
  // URL del backend (Render u otro). En local apunta al Express
  // de desarrollo. EDITAR al desplegar.
  API_URL: esLocal
    ? 'http://localhost:8787'
    : 'https://CAMBIA-ESTO.onrender.com',

  // Solo los usa el panel de administración (admin.html) para
  // iniciar sesión. La anon key es pública por diseño de Supabase;
  // la service role key JAMÁS va aquí.
  SUPABASE_URL: 'https://CAMBIA-ESTO.supabase.co',
  SUPABASE_ANON_KEY: 'CAMBIA-ESTO',

  // Identidad del observatorio (para replicar en otra región,
  // basta cambiar estos textos y el GeoJSON de límites).
  NOMBRE_CORTO: 'OJAM',
  NOMBRE_LARGO: 'Observatorio de Justicia Ambiental del Magdalena',
  ARCHIVO_LIMITES: 'assets/geo/municipios-magdalena.geojson',
  // Contorno disuelto del departamento (halo neón del mapa).
  ARCHIVO_CONTORNO: 'assets/geo/magdalena-contorno.geojson',

  // Vista inicial del mapa: Magdalena centrado, con los
  // departamentos vecinos (Atlántico, Bolívar, Cesar, La Guajira)
  // visibles en el encuadre.
  MAPA: {
    centro: [10.15, -74.25],
    zoom: 8,
    zoomMinimo: 6,
    zoomMaximo: 18,
    // Nivel a partir del cual se muestran los nombres de municipios.
    zoomEtiquetas: 9
  }
};
