import { handlePublicSportsPostQuery } from '@/lib/public-sports-api/post-query'
import { publicSportsJson } from '@/lib/public-sports-api'

export async function POST(request: Request) {
  return handlePublicSportsPostQuery(request)
}

export async function OPTIONS() {
  return publicSportsJson({ ok: true })
}
