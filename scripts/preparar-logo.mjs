// Prepara el logo oficial de OJAM para la web: toma Logo/Logotipo_v1.png,
// detecta el emblema circular, lo recorta con fondo transparente y lo
// guarda redimensionado como frontend/assets/logo-redondo.png.
// Sin dependencias: PNG decodificado/codificado a mano con zlib de Node.
//
// Uso:  node scripts/preparar-logo.mjs

import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGEN = path.join(RAIZ, 'Logo', 'Logotipo_v1.png');
const DESTINO = path.join(RAIZ, 'frontend', 'assets', 'logo-redondo.png');
const TAMANO_SALIDA = 256;

// --- Decodificador PNG (8 bits, RGB/RGBA, sin entrelazado) -------

function decodificarPNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('No es un PNG');
  let pos = 8;
  let ancho, alto, tipoColor;
  const idat = [];
  while (pos < buf.length) {
    const largo = buf.readUInt32BE(pos);
    const tipo = buf.toString('ascii', pos + 4, pos + 8);
    const datos = buf.subarray(pos + 8, pos + 8 + largo);
    if (tipo === 'IHDR') {
      ancho = datos.readUInt32BE(0);
      alto = datos.readUInt32BE(4);
      if (datos[8] !== 8) throw new Error('Solo se admite 8 bits por canal');
      tipoColor = datos[9];
      if (![2, 6].includes(tipoColor)) throw new Error(`Tipo de color ${tipoColor} no admitido`);
      if (datos[12] !== 0) throw new Error('PNG entrelazado no admitido');
    } else if (tipo === 'IDAT') {
      idat.push(datos);
    } else if (tipo === 'IEND') break;
    pos += 12 + largo;
  }
  const bpp = tipoColor === 6 ? 4 : 3;
  const crudo = zlib.inflateSync(Buffer.concat(idat));
  const porFila = ancho * bpp;
  const pix = Buffer.alloc(ancho * alto * 4);

  let previa = Buffer.alloc(porFila);
  for (let y = 0; y < alto; y++) {
    const filtro = crudo[y * (porFila + 1)];
    const fila = Buffer.from(crudo.subarray(y * (porFila + 1) + 1, (y + 1) * (porFila + 1)));
    for (let i = 0; i < porFila; i++) {
      const a = i >= bpp ? fila[i - bpp] : 0;
      const b = previa[i];
      const c = i >= bpp ? previa[i - bpp] : 0;
      let valor = fila[i];
      if (filtro === 1) valor += a;
      else if (filtro === 2) valor += b;
      else if (filtro === 3) valor += (a + b) >> 1;
      else if (filtro === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        valor += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      fila[i] = valor & 0xff;
    }
    previa = fila;
    for (let x = 0; x < ancho; x++) {
      const d = (y * ancho + x) * 4;
      const s = x * bpp;
      pix[d] = fila[s];
      pix[d + 1] = fila[s + 1];
      pix[d + 2] = fila[s + 2];
      pix[d + 3] = bpp === 4 ? fila[s + 3] : 255;
    }
  }
  return { ancho, alto, pix };
}

// --- Codificador PNG (reutiliza el enfoque de generar-iconos) ----

const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (b) => {
  let c = 0xffffffff;
  for (const x of b) c = TABLA_CRC[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(tipo, datos) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([len, cuerpo, crc]);
}
function codificarPNG(ancho, alto, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0);
  ihdr.writeUInt32BE(alto, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const filas = Buffer.alloc((ancho * 4 + 1) * alto);
  for (let y = 0; y < alto; y++) {
    rgba.copy(filas, y * (ancho * 4 + 1) + 1, y * ancho * 4, (y + 1) * ancho * 4);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(filas, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// --- Proceso -----------------------------------------------------

const { ancho, alto, pix } = decodificarPNG(fs.readFileSync(ORIGEN));

// Color de fondo: el de la esquina superior izquierda.
const fondo = [pix[0], pix[1], pix[2]];
const esFondo = (i) =>
  Math.abs(pix[i] - fondo[0]) + Math.abs(pix[i + 1] - fondo[1]) + Math.abs(pix[i + 2] - fondo[2]) < 48;

// Bounding box del emblema por histogramas (ignora motas sueltas).
const porCol = new Array(ancho).fill(0);
const porFila = new Array(alto).fill(0);
for (let y = 0; y < alto; y++) {
  for (let x = 0; x < ancho; x++) {
    if (!esFondo((y * ancho + x) * 4)) {
      porCol[x]++;
      porFila[y]++;
    }
  }
}
const UMBRAL = 8;
const x0 = porCol.findIndex((v) => v > UMBRAL);
const x1 = ancho - 1 - [...porCol].reverse().findIndex((v) => v > UMBRAL);
const y0 = porFila.findIndex((v) => v > UMBRAL);
const y1 = alto - 1 - [...porFila].reverse().findIndex((v) => v > UMBRAL);
console.log(`emblema detectado: x ${x0}–${x1}, y ${y0}–${y1} (${x1 - x0 + 1}×${y1 - y0 + 1})`);

const cx = (x0 + x1) / 2;
const cy = (y0 + y1) / 2;
const radio = Math.max(x1 - x0, y1 - y0) / 2 + 2;

// Muestreo bilineal del recorte circular hacia el tamaño de salida.
const N = TAMANO_SALIDA;
const salida = Buffer.alloc(N * N * 4);
const escala = (radio * 2) / N;
for (let py = 0; py < N; py++) {
  for (let px = 0; px < N; px++) {
    const sx = cx - radio + (px + 0.5) * escala;
    const sy = cy - radio + (py + 0.5) * escala;
    const xi = Math.max(0, Math.min(ancho - 2, Math.floor(sx)));
    const yi = Math.max(0, Math.min(alto - 2, Math.floor(sy)));
    const fx = sx - xi;
    const fy = sy - yi;
    const d = (py * N + px) * 4;
    for (let c = 0; c < 3; c++) {
      const v00 = pix[(yi * ancho + xi) * 4 + c];
      const v10 = pix[(yi * ancho + xi + 1) * 4 + c];
      const v01 = pix[((yi + 1) * ancho + xi) * 4 + c];
      const v11 = pix[((yi + 1) * ancho + xi + 1) * 4 + c];
      salida[d + c] = Math.round(
        v00 * (1 - fx) * (1 - fy) + v10 * fx * (1 - fy) + v01 * (1 - fx) * fy + v11 * fx * fy
      );
    }
    // Máscara circular con borde suavizado (~1.5 px de pluma).
    const dist = Math.hypot(px + 0.5 - N / 2, py + 0.5 - N / 2);
    const borde = N / 2 - 1;
    const alfa = dist <= borde - 1.5 ? 255 : dist >= borde ? 0 : Math.round(255 * (borde - dist) / 1.5);
    salida[d + 3] = alfa;
  }
}

fs.writeFileSync(DESTINO, codificarPNG(N, N, salida));
console.log(`✓ ${DESTINO} (${(fs.statSync(DESTINO).size / 1024).toFixed(1)} KB)`);
