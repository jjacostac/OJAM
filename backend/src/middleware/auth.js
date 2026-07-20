import { supabase } from '../lib/supabase.js';

// Lista blanca de correos de administración (ADMIN_EMAIL admite
// varios, separados por coma). Supabase Auth valida la identidad;
// esta lista decide quién de esos usuarios puede administrar OJAM.
const ADMINS = (process.env.ADMIN_EMAIL || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export async function requiereAdmin(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Sesión requerida.' });
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    return res.status(401).json({ error: 'Sesión inválida o expirada.' });
  }

  const email = (data.user.email || '').toLowerCase();
  if (ADMINS.length === 0 || !ADMINS.includes(email)) {
    return res.status(403).json({ error: 'Cuenta sin permisos de administración.' });
  }

  req.admin = { id: data.user.id, email };
  next();
}
