// Servidor local mínimo para previsualizar el frontend de OJAM sin
// instalar nada (usa solo Node). NO es para producción: en producción
// el frontend lo sirve Netlify/Vercel.
//
// Uso:   node scripts/servidor-local.mjs
// Abre:  http://localhost:5173
//
// El puerto 5173 coincide con el PUBLIC_URL de ejemplo de .env, de
// modo que el CORS del backend local funciona sin tocar nada.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'frontend');
const PUERTO = Number(process.env.PORT) || 5173;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.geojson': 'application/geo+json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

const servidor = http.createServer((peticion, respuesta) => {
  let ruta = decodeURIComponent(new URL(peticion.url, 'http://x').pathname);
  if (ruta.endsWith('/')) ruta += 'index.html';

  const archivo = path.normalize(path.join(RAIZ, ruta));
  if (!archivo.startsWith(RAIZ)) {
    respuesta.writeHead(403).end('Prohibido');
    return;
  }

  fs.readFile(archivo, (error, contenido) => {
    if (error) {
      respuesta.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      respuesta.end(`404 — no existe ${ruta}`);
      return;
    }
    respuesta.writeHead(200, {
      'Content-Type': MIME[path.extname(archivo).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    respuesta.end(contenido);
  });
});

servidor.listen(PUERTO, () => {
  console.log('');
  console.log('  OJAM — vista previa local');
  console.log(`  ✓ Sirviendo la carpeta frontend en: http://localhost:${PUERTO}`);
  console.log('  (Ctrl+C para detener)');
  console.log('');
});
