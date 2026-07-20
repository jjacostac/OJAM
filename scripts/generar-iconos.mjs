// Genera los íconos PNG de la PWA (192 y 512 px) a partir del mismo
// motivo del logo (gota + hoja) — sin dependencias: el PNG se
// codifica a mano con zlib de Node.
//
// Uso:  node scripts/generar-iconos.mjs
// Reemplazables: si el proyecto adopta un logo definitivo, basta con
// sobrescribir frontend/assets/icons/icon-192.png e icon-512.png.

import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// --- Codificador PNG mínimo (RGBA 8 bits) ------------------------

const TABLA_CRC = (() => {
  const tabla = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabla[n] = c >>> 0;
  }
  return tabla;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = TABLA_CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(tipo, datos) {
  const cabecera = Buffer.alloc(4);
  cabecera.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([cabecera, cuerpo, crc]);
}

function png(ancho, alto, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0);
  ihdr.writeUInt32BE(alto, 4);
  ihdr[8] = 8;  // profundidad
  ihdr[9] = 6;  // tipo de color: RGBA
  const filas = Buffer.alloc((ancho * 4 + 1) * alto);
  for (let y = 0; y < alto; y++) {
    filas[y * (ancho * 4 + 1)] = 0; // filtro: ninguno
    rgba.copy(filas, y * (ancho * 4 + 1) + 1, y * ancho * 4, (y + 1) * ancho * 4);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(filas, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// --- Dibujo del motivo gota + hoja -------------------------------

const FONDO = [0x14, 0x53, 0x2d];   // verde bosque
const GOTA = [0xf0, 0xfd, 0xf4];    // blanco verdoso
const HOJA = [0x4a, 0xde, 0x80];    // verde hoja

function dentroRectRedondeado(x, y, radio) {
  const min = radio;
  const max = 1 - radio;
  if (x >= min && x <= max) return y >= 0 && y <= 1;
  if (y >= min && y <= max) return x >= 0 && x <= 1;
  const cx = x < min ? min : max;
  const cy = y < min ? min : max;
  return (x - cx) ** 2 + (y - cy) ** 2 <= radio ** 2;
}

function dentroGota(x, y) {
  // círculo inferior + triángulo hacia el vértice superior
  const enCirculo = (x - 0.5) ** 2 + (y - 0.60) ** 2 <= 0.205 ** 2;
  const apex = [0.5, 0.14];
  const izq = [0.325, 0.55];
  const der = [0.675, 0.55];
  const enTriangulo = puntoEnTriangulo([x, y], apex, izq, der);
  return enCirculo || enTriangulo;
}

function puntoEnTriangulo(p, a, b, c) {
  const signo = (p1, p2, p3) =>
    (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1]);
  const d1 = signo(p, a, b);
  const d2 = signo(p, b, c);
  const d3 = signo(p, c, a);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

function dentroHoja(x, y) {
  // elipse rotada 45° dentro de la gota
  const dx = x - 0.578;
  const dy = y - 0.635;
  const cos = Math.SQRT1_2;
  const u = dx * cos + dy * cos;
  const v = -dx * cos + dy * cos;
  return (u / 0.115) ** 2 + (v / 0.048) ** 2 <= 1;
}

function pintar(tamano) {
  const rgba = Buffer.alloc(tamano * tamano * 4);
  const SUB = 3; // sobremuestreo 3×3 para suavizar bordes
  for (let py = 0; py < tamano; py++) {
    for (let px = 0; px < tamano; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SUB; sy++) {
        for (let sx = 0; sx < SUB; sx++) {
          const x = (px + (sx + 0.5) / SUB) / tamano;
          const y = (py + (sy + 0.5) / SUB) / tamano;
          let color = null;
          if (dentroRectRedondeado(x, y, 0.18)) {
            color = FONDO;
            if (dentroGota(x, y)) color = GOTA;
            if (dentroHoja(x, y)) color = HOJA;
          }
          if (color) {
            r += color[0]; g += color[1]; b += color[2]; a += 255;
          }
        }
      }
      const n = SUB * SUB;
      const i = (py * tamano + px) * 4;
      rgba[i] = Math.round(r / n);
      rgba[i + 1] = Math.round(g / n);
      rgba[i + 2] = Math.round(b / n);
      rgba[i + 3] = Math.round(a / n);
    }
  }
  return png(tamano, tamano, rgba);
}

for (const tamano of [192, 512]) {
  const destino = path.join(RAIZ, 'frontend', 'assets', 'icons', `icon-${tamano}.png`);
  fs.writeFileSync(destino, pintar(tamano));
  console.log(`✓ ${destino} (${(fs.statSync(destino).size / 1024).toFixed(1)} KB)`);
}
