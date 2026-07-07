import { prisma } from '@/lib/prisma'

/**
 * Organigrama: grupos y subgrupos por CONTENCIÓN (agregación hacia arriba).
 *
 * Regla de negocio:
 * - Un grupo muestra a sus miembros directos Y a los de todos sus subgrupos
 *   (ej.: "Entrenadores" agrupa a los de "Boliplaya" y "Bolipista").
 * - Un subgrupo NO muestra a los miembros de sus grupos superiores.
 * Se calcula al vuelo (miembros efectivos = directos + directos del subárbol),
 * sin duplicar filas: mover o quitar a alguien en un subgrupo se refleja solo
 * en todos sus grupos superiores.
 */

export const GROUP_MEMBER_ROLES = ['PLAYER', 'COACH', 'FAMILY'] as const
export type GroupMemberRole = (typeof GROUP_MEMBER_ROLES)[number]

export const GROUP_ROLE_LABEL: Record<GroupMemberRole, string> = {
  PLAYER: 'Jugador',
  COACH: 'Entrenador',
  FAMILY: 'Familiar',
}

export function normalizeGroupRole(input: unknown): GroupMemberRole {
  const role = String(input || '').toUpperCase()
  return (GROUP_MEMBER_ROLES as readonly string[]).includes(role)
    ? (role as GroupMemberRole)
    : 'PLAYER'
}

type GroupRow = { id: string; name: string; parentId: string | null }

export type GroupTreeNode = {
  id: string
  name: string
  parentId: string | null
  directMemberCount: number
  children: GroupTreeNode[]
}

/** Árbol completo de grupos con contadores de miembros directos. */
export async function getGroupTree(): Promise<GroupTreeNode[]> {
  const groups = await prisma.group.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { memberships: true } } },
  })

  const nodes = new Map<string, GroupTreeNode>()
  for (const g of groups) {
    nodes.set(g.id, {
      id: g.id,
      name: g.name,
      parentId: g.parentId,
      directMemberCount: g._count.memberships,
      children: [],
    })
  }

  const roots: GroupTreeNode[] = []
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  return roots
}

/** Ids de los ancestros de un grupo (padre, abuelo…), sin incluir el propio. */
export function ancestorIdsOf(groupId: string, groups: GroupRow[]): string[] {
  const byId = new Map(groups.map((g) => [g.id, g]))
  const out: string[] = []
  const seen = new Set<string>([groupId]) // corta ciclos defensivamente
  let current = byId.get(groupId)
  while (current?.parentId && !seen.has(current.parentId)) {
    seen.add(current.parentId)
    out.push(current.parentId)
    current = byId.get(current.parentId)
  }
  return out
}

/** Ids del subárbol de un grupo (él mismo + todos sus descendientes). */
export function subtreeIdsOf(groupId: string, groups: GroupRow[]): string[] {
  const childrenOf = new Map<string, string[]>()
  for (const g of groups) {
    if (!g.parentId) continue
    const list = childrenOf.get(g.parentId) ?? []
    list.push(g.id)
    childrenOf.set(g.parentId, list)
  }
  const out: string[] = []
  const queue = [groupId]
  const seen = new Set<string>()
  while (queue.length) {
    const id = queue.shift()!
    if (seen.has(id)) continue
    seen.add(id)
    out.push(id)
    for (const child of childrenOf.get(id) ?? []) queue.push(child)
  }
  return out
}

export type EffectiveGroupMember = {
  membershipId: string | null
  memberId: string
  name: string
  email: string
  role: GroupMemberRole
  /** true si la pertenencia viene de un subgrupo (no es miembro directo). */
  inherited: boolean
  /** Nombre del subgrupo del que viene (si inherited). */
  inheritedFrom: string | null
}

/**
 * Miembros efectivos de un grupo = directos + los de todos sus subgrupos.
 * Si alguien está en el grupo y también en un subgrupo, gana la fila directa.
 */
export async function getEffectiveGroupMembers(groupId: string): Promise<EffectiveGroupMember[]> {
  const groups = await prisma.group.findMany({ select: { id: true, name: true, parentId: true } })
  const groupName = new Map(groups.map((g) => [g.id, g.name]))
  const subtree = subtreeIdsOf(groupId, groups) // incluye el propio grupo

  const rows = await prisma.groupMembership.findMany({
    where: { groupId: { in: subtree } },
    include: { member: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: 'asc' },
  })

  const byMember = new Map<string, EffectiveGroupMember>()
  for (const row of rows) {
    const direct = row.groupId === groupId
    const existing = byMember.get(row.memberId)
    if (existing && !direct) continue // ya hay fila (directa o heredada previa)
    if (existing && direct && !existing.inherited) continue
    byMember.set(row.memberId, {
      membershipId: direct ? row.id : null,
      memberId: row.memberId,
      name: row.member.name,
      email: row.member.email || '',
      role: normalizeGroupRole(row.role),
      inherited: !direct,
      inheritedFrom: direct ? null : groupName.get(row.groupId) ?? null,
    })
  }

  return [...byMember.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'))
}

/**
 * Expande una lista de grupos con TODOS sus ancestros. Es el INVERSO de la
 * contención descendente: un evento sobre un grupo convoca a los socios de su
 * subárbol, así que para saber qué eventos "ve" un socio hay que mirar sus
 * grupos directos y todos sus grupos superiores (el evento puede estar en un
 * grupo padre del suyo).
 */
export async function groupIdsWithAncestors(directGroupIds: string[]): Promise<string[]> {
  const ids = [...new Set(directGroupIds)]
  if (ids.length === 0) return []
  const groups = await prisma.group.findMany({ select: { id: true, name: true, parentId: true } })
  const set = new Set<string>(ids)
  for (const gid of ids) {
    for (const anc of ancestorIdsOf(gid, groups)) set.add(anc)
  }
  return [...set]
}

/** Ids (únicos) de los socios efectivos de un grupo (directos + de sus subgrupos). */
export async function effectiveGroupMemberIds(groupId: string): Promise<string[]> {
  const groups = await prisma.group.findMany({ select: { id: true, name: true, parentId: true } })
  const subtree = subtreeIdsOf(groupId, groups)
  const rows = await prisma.groupMembership.findMany({
    where: { groupId: { in: subtree } },
    select: { memberId: true },
  })
  return [...new Set(rows.map((r) => r.memberId))]
}
