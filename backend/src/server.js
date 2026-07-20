import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { rutasPublicas } from './routes/public.js';
import { rutasAdmin } from './routes/admin.js';

const app = express();

// Render/Netlify ponen la app detrás de un proxy: necesario para
// que el rate-limiting vea la IP real del visitante.
app.set('trust proxy', 1);
app.disable('x-powered-by');

// CORS: acepta la(s) URL(s) de PUBLIC_URL (separadas por coma).
// Al migrar al dominio .org solo se agrega aquí vía variable de
// entorno — sin cambios de código (ver docs/dominio.md).
const origenesPermitidos = (process.env.PUBLIC_URL || '')
  .split(',')
  .map((u) => u.trim().replace(/\/$/, ''))
  .filter(Boolean);

app.use(
  cors({
    origin(origen, cb) {
      // Peticiones sin Origin (curl, apps nativas empaquetadas con
      // Capacitor, misma máquina) se permiten.
      if (!origen || origenesPermitidos.includes(origen)) return cb(null, true);
      cb(new Error(`Origen no permitido por CORS: ${origen}`));
    }
  })
);

app.use(express.json({ limit: '100kb' }));

app.get('/salud', (_req, res) => res.json({ ok: true, servicio: 'ojam-backend' }));

app.use('/api', rutasPublicas);
app.use('/api/admin', rutasAdmin);

// Errores no manejados (incluido el rechazo de CORS).
app.use((err, _req, res, _next) => {
  if (err?.message?.startsWith('Origen no permitido')) {
    return res.status(403).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

const puerto = Number(process.env.PORT) || 8787;
app.listen(puerto, () => {
  console.log(`OJAM backend escuchando en http://localhost:${puerto}`);
  console.log(`Orígenes CORS permitidos: ${origenesPermitidos.join(', ') || '(ninguno configurado)'}`);
});
