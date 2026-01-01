import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  console.error('Missing env. Check .env.local for VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })

async function main() {
  console.log('🔍 Testing Supabase connectivity…')
  const { data: pong, error: pingErr } = await supabase.from('pg_stat_activity').select('pid').limit(1)
  if (pingErr) {
    console.error('❌ DB request failed:', pingErr.message)
  } else {
    console.log('✅ DB reachable.')
  }

  const { data: sessionData, error: sessionErr } = await supabase.auth.getSession()
  if (sessionErr) console.error('Auth getSession error:', sessionErr.message)
  console.log('Session:', sessionData?.session ?? '(none)')

  // Optional: probe a table you actually have, e.g. profiles or users
  // const { data, error } = await supabase.from('profiles').select('*').limit(1)
  // console.log('Profiles sample:', data, 'err:', error?.message)
}

main()
