import rateLimit from 'express-rate-limit';

// Decisión explícita del proyecto: las rutas públicas NO usan
// captcha ni verificación de bots. El rate-limiting es la única
// barrera contra abuso del formulario — mantenerlo.

// Límite general de lectura pública.
export const limiteLectura = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false
});

// Límite estricto para el alta de reportes: 5 envíos por IP cada
// 15 minutos. Suficiente para uso real (incluida la cola offline
// que reintenta), hostil para scripts de spam.
export const limiteEnvio = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: 'Demasiados envíos desde esta conexión. Intenta de nuevo en unos minutos.'
  }
});
