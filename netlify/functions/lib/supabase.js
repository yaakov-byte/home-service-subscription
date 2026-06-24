// ===============================================================
// netlify/functions/lib/supabase.js
//
// Shared Supabase client for all Netlify functions.
// Uses the service_role key for full database access.
// ===============================================================

const { createClient } = require('@supabase/supabase-js');

function getSupabase() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
        throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables.');
  }

  return createClient(url, key);
}

module.exports = { getSupabase };
