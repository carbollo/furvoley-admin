import { prisma } from '@/lib/prisma'

/**
 * Organigrama: grupos y subgrupos con HERENCIA HACIA ABAJO.
 *
 * Regla de negocio (roadmap · Módulo 5.2):
 * - Meter a alguien en un grupo padre lo propaga a todos sus subgrupos
 *   (ej.: entrenador en "Entrenadores" → está en "Boliplaya" y "Bolipista").
 * - Meterlo solo en un subgrupo lo deja solo ahí.
 * La herencia se calcula al vuelo (miembros efectivos = directos + directos de
 * los ancestros), sin duplicar filas: mover o quitar a alguien del padre se
 * refleja solo en toda la rama.
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
  /** true si la pertenencia viene heredada de un grupo ancestro. */
  inherited: boolean
  /** Nombre del grupo del que hereda (si inherited). */
  inheritedFrom: string | null
}

/**
 * Miembros efectivos de un grupo = directos + heredados de sus ancestros.
 * Si alguien está en el grupo y en un ancestro, gana la fila directa.
 */
export async function getEffectiveGroupMembers(groupId: string): Promise<EffectiveGroupMember[]> {
  const groups = await prisma.group.findMany({ select: { id: true, name: true, parentId: true } })
  const groupName = new Map(groups.map((g) => [g.id, g.name]))
  const ancestors = ancestorIdsOf(groupId, groups)

  const rows = await prisma.groupMembership.findMany({
    where: { groupId: { in: [groupId, ...ancestors] } },
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
