import { prisma } from '@/lib/prisma'
import { runWithTenant } from '@/lib/multitenant/request'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

const ON_SURFACE = '#191b23'
const ON_SURFACE_VARIANT = '#424754'
const OUTLINE = '#727785'
const PRIMARY = '#0058be'

const SHADOW = '0 4px 10px rgba(0,0,0,0.04)'
const BORDER = '1px solid rgba(194,198,214,0.4)'

export default async function MuralPage() {
  return runWithTenant(() => MuralPageImpl())
}

async function MuralPageImpl() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const posts = await prisma.newsPost.findMany({
    where: { isPublished: true },
    orderBy: [{ priority: 'desc' }, { publishedAt: 'desc' }, { createdAt: 'desc' }],
    include: { author: { select: { name: true } } },
  })

  return (
    <div style={{ maxWidth: 1320, margin: '0 auto' }}>
      <header style={{ marginBottom: 32 }}>
        <h1
          style={{
            fontSize: 28,
            fontWeight: 800,
            color: ON_SURFACE,
            letterSpacing: '-0.01em',
            margin: 0,
            lineHeight: 1.2,
          }}
        >
          Mural de noticias
        </h1>
        <p style={{ color: ON_SURFACE_VARIANT, fontSize: 16, marginTop: 6 }}>
          Toda la información publicada por el club, ordenada de más reciente a más antigua.
        </p>
      </header>

      <div
        className="grid gap-6"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}
      >
        {posts.length === 0 && (
          <div
            style={{
              gridColumn: '1 / -1',
              background: '#fff',
              border: BORDER,
              boxShadow: SHADOW,
              borderRadius: 16,
              padding: 48,
              textAlign: 'center',
              color: OUTLINE,
            }}
          >
            No hay noticias publicadas.
          </div>
        )}
        {posts.map((post) => {
          const published = post.publishedAt || post.createdAt
          const isHigh = post.priority === 'HIGH'
          return (
            <article
              key={post.id}
              style={{
                background: '#fff',
                border: BORDER,
                borderTop: isHigh ? '4px solid #ba1a1a' : undefined,
                boxShadow: SHADOW,
                borderRadius: 16,
                padding: 24,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <div className="flex items-center gap-2">
                <h2
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    color: ON_SURFACE,
                    margin: 0,
                    flex: 1,
                  }}
                >
                  {post.title}
                </h2>
                {isHigh && (
                  <span
                    style={{
                      background: 'rgba(186,26,26,0.12)',
                      color: '#ba1a1a',
                      padding: '4px 10px',
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 800,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                    }}
                  >
                    Destacada
                  </span>
                )}
              </div>
              <p
                style={{
                  color: ON_SURFACE_VARIANT,
                  fontSize: 14,
                  margin: 0,
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {post.content}
              </p>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: 'auto',
                  paddingTop: 12,
                  borderTop: '1px solid rgba(194,198,214,0.25)',
                  fontSize: 12,
                  color: OUTLINE,
                }}
              >
                <span>
                  {new Date(published).toLocaleDateString('es-ES', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </span>
                {post.author?.name && (
                  <span style={{ color: PRIMARY, fontWeight: 600 }}>{post.author.name}</span>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}
