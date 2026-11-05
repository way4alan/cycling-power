import { handleLineAuth } from './handler.ts'

if (import.meta.main) {
  const port = Number(Deno.env.get('PORT') || '8000')
  Deno.serve({ port }, (req) => handleLineAuth(req))
}
