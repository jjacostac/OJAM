import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    'Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY. ' +
    'Copia .env.example como backend/.env y completa los valores.'
  );
  process.exit(1);
}

// Cliente con service role: SOLO existe en el servidor. Bypassa RLS,
// por eso esta key jamás debe llegar al frontend ni al repositorio.
export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});
