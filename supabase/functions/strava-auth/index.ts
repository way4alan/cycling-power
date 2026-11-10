import { handleStravaAuth } from '../strava/logic.ts'
import { serviceStore } from '../strava/store.ts'

if (import.meta.main) {
  const port = Number(Deno.env.get('PORT') || '8000')
  Deno.serve({ port }, (req) => {
    const url = Deno.env.get('SUPABASE_URL') || ''
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    return handleStravaAuth(req, Deno.env, fetch, serviceStore(url, key))
  })
}
