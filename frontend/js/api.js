import { CONFIG } from './config.js';

async function pedir(ruta, opciones = {}) {
  const respuesta = await fetch(`${CONFIG.API_URL}/api${ruta}`, {
    headers: { 'Content-Type': 'application/json', ...(opciones.headers || {}) },
    ...opciones
  });
  const cuerpo = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    const error = new Error(cuerpo.error || `Error ${respuesta.status}`);
    error.estado = respuesta.status;
    throw error;
  }
  return cuerpo;
}

export const api = {
  categorias: () => pedir('/categorias'),
  reportes: () => pedir('/reportes'),
  crearReporte: (datos) =>
    pedir('/reportes', { method: 'POST', body: JSON.stringify(datos) })
};
