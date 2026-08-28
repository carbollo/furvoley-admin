"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { normalizeRole } from "@/lib/rbac";
import { runWithTenant } from "@/lib/multitenant/request";

function normalizeDni(dni: string): string {
  return dni.trim().toUpperCase().replace(/\s+/g, "");
}

function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

/**
 * Autorización de las MUTACIONES de eventos. Estos son server actions ('use server'
 * → endpoints RPC invocables por cualquier cliente), así que la seguridad debe estar
 * aquí, no en la UI. Solo ADMIN o COACH (y COACH únicamente en sus equipos). Todas
 * las acciones se ejecutan además dentro de runWithTenant (activa la BD del club por
 * host) para no depender de que exista contexto de tenant al invocar el action.
 */
async function assertEventStaff(
  groupId: string | null | undefined,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getServerSession(authOptions);
  const user = session?.user as { role?: string; memberId?: string | null } | undefined;
  if (!user) return { ok: false, error: "No autorizado" };
  const role = normalizeRole(user.role);
  if (role !== "ADMIN" && role !== "COACH") return { ok: false, error: "No autorizado" };
  // Un evento SIN equipo es del club entero, y eso es cosa del ADMIN. Antes la
  // comprobacion de equipo solo corria `if (groupId)`, asi que un entrenador
  // pasaba de largo justo en los eventos que no eran suyos.
  if (role === "COACH" && !groupId) {
    return { ok: false, error: "Solo el administrador puede tocar los eventos del club" };
  }
  if (role === "COACH" && groupId) {
    const owns = user.memberId
      ? await prisma.groupMembership.findFirst({
          where: { groupId, memberId: user.memberId, role: "COACH" },
          select: { id: true },
        })
      : null;
    if (!owns) return { ok: false, error: "No tienes acceso a este equipo" };
  }
  return { ok: true };
}

/** Marca interna: uno de los DNI ya estaba inscrito. */
class DniRepetido extends Error {}

export async function registerGuestAttendees(
  eventId: string,
  attendees: { firstName: string; lastName: string; dni: string }[],
  contactPhone: string
): Promise<{ success: true; count: number } | { success: false; error: string }> {
  return runWithTenant(async () => {
  try {
    if (!attendees?.length || attendees.length > 20) {
      return { success: false, error: "Indica entre 1 y 20 entradas." };
    }
    const phoneDigits = digitsOnly(contactPhone);
    if (phoneDigits.length < 9) {
      return {
        success: false,
        error: "Introduce un teléfono de contacto válido (mín. 9 dígitos).",
      };
    }

    const normalized = attendees.map((a) => ({
      firstName: a.firstName.trim(),
      lastName: a.lastName.trim(),
      dni: normalizeDni(a.dni),
    }));

    for (const a of normalized) {
      if (a.firstName.length < 2 || a.lastName.length < 2) {
        return { success: false, error: "Nombre y apellidos demasiado cortos." };
      }
      if (a.dni.length < 5) {
        return { success: false, error: "Revisa el DNI/NIE de cada participante." };
      }
    }

    const dnis = normalized.map((a) => a.dni);
    if (new Set(dnis).size !== dnis.length) {
      return { success: false, error: "Hay DNI repetidos en el formulario." };
    }

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, status: true, maxAttendees: true, isPublic: true },
    });
    if (!event) {
      return { success: false, error: "Evento no encontrado." };
    }
    if (event.status === "CANCELLED") {
      return { success: false, error: "Este evento está cancelado." };
    }
    // Esta funcion se invoca SIN sesion (es el formulario de invitados de un
    // evento abierto). Sin esta comprobacion, cualquiera con el id de un
    // entrenamiento interno metia nombres y DNI inventados en su lista y le
    // llenaba el aforo al club.
    if (!event.isPublic) {
      return { success: false, error: "Este evento no admite inscripciones de invitados." };
    }

    const sinPlazas = await prisma.$transaction(async (tx) => {
      const memberSlots = await tx.attendance.count({
        where: { eventId, status: { in: ["PENDING", "PRESENT"] } },
      });
      const guestSlots = await tx.eventGuestAttendee.count({ where: { eventId } });
      const taken = memberSlots + guestSlots;
      if (event.maxAttendees != null && taken + normalized.length > event.maxAttendees) {
        return true;
      }

      const conflict = await tx.eventGuestAttendee.findFirst({
        where: { eventId, dni: { in: dnis } },
      });
      if (conflict) throw new DniRepetido();

      await tx.eventGuestAttendee.createMany({
        data: normalized.map((a, i) => ({
          eventId,
          firstName: a.firstName,
          lastName: a.lastName,
          dni: a.dni,
          phone: i === 0 ? phoneDigits : null,
        })),
      });
      return false;
    });
    if (sinPlazas) {
      return { success: false, error: "No hay plazas suficientes para todas las entradas." };
    }

    revalidatePath(`/events/${eventId}`);
    revalidatePath("/events");
    revalidatePath(`/calendar/${eventId}`);
    revalidatePath("/calendar");

    return { success: true, count: normalized.length };
  } catch (e: unknown) {
    if (e instanceof DniRepetido) {
      return { success: false, error: "Algún DNI ya está inscrito en este evento." };
    }
    console.error("registerGuestAttendees", e);
    if (
      e &&
      typeof e === "object" &&
      "code" in e &&
      (e as { code: string }).code === "P2002"
    ) {
      return { success: false, error: "Algún DNI ya está inscrito en este evento." };
    }
    return { success: false, error: "No se pudo completar la inscripción." };
  }
  });
}

export type RegisterForEventResult =
  | { success: true; code: "REGISTERED" | "ALREADY" }
  | {
      success: false;
      code:
        | "LOGIN"
        | "NO_MEMBER"
        | "NOT_FOUND"
        | "CANCELLED"
        | "NOT_IN_TEAM"
        | "FULL";
    };

export async function registerForEvent(eventId: string): Promise<RegisterForEventResult> {
  return runWithTenant(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return { success: false, code: "LOGIN" };
  }

  const memberId = (session.user as { memberId?: string | null }).memberId;
  if (!memberId) {
    return { success: false, code: "NO_MEMBER" };
  }

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, status: true, groupId: true, maxAttendees: true },
  });

  if (!event) {
    return { success: false, code: "NOT_FOUND" };
  }
  if (event.status === "CANCELLED") {
    return { success: false, code: "CANCELLED" };
  }

  if (event.groupId) {
    const inTeam = await prisma.groupMembership.findUnique({
      where: {
        groupId_memberId: { groupId: event.groupId, memberId },
      },
    });
    if (!inTeam) {
      return { success: false, code: "NOT_IN_TEAM" };
    }
  }

  const registrationCount = await prisma.attendance.count({
    where: {
      eventId,
      status: { in: ["PENDING", "PRESENT"] },
    },
  });
  const guestCount = await prisma.eventGuestAttendee.count({ where: { eventId } });
  const totalTaken = registrationCount + guestCount;

  const existing = await prisma.attendance.findUnique({
    where: {
      eventId_memberId: { eventId, memberId },
    },
  });

  if (existing?.status === "PENDING" || existing?.status === "PRESENT") {
    return { success: true, code: "ALREADY" };
  }

  if (event.maxAttendees != null && totalTaken >= event.maxAttendees) {
    return { success: false, code: "FULL" };
  }

  if (existing) {
    await prisma.attendance.update({
      where: { id: existing.id },
      data: { status: "PENDING", reason: null },
    });
  } else {
    await prisma.attendance.create({
      data: { eventId, memberId, status: "PENDING" },
    });
  }

  revalidatePath(`/events/${eventId}`);
  revalidatePath("/events");
  revalidatePath(`/calendar/${eventId}`);
  revalidatePath("/calendar");

  return { success: true, code: "REGISTERED" };
  });
}

export async function getEvents() {
  return runWithTenant(async () => {
  // Lectura de la lista de eventos del club (vista de gestión): solo staff.
  const staff = await assertEventStaff(null);
  if (!staff.ok) return { success: false, error: "No autorizado" };
  try {
    const events = await prisma.event.findMany({
      orderBy: { date: "asc" },
      include: {
        group: true,
        _count: {
          select: { attendances: true, guestAttendees: true },
        },
      },
    });
    return { success: true, data: events };
  } catch (error) {
    console.error("Error fetching events:", error);
    return { success: false, error: "Error al obtener los eventos" };
  }
  });
}

export async function getEventById(id: string) {
  // La página /events/[id] puede servir como enlace público de un evento, así que
  // esta lectura no exige sesión; runWithTenant la limita al club del host (evita
  // lecturas cruzadas entre clubes al invocar el RPC directamente).
  //
  // NO se traen los inscritos. Este fichero lleva la directiva de servidor, así
  // que CADA export suyo es un RPC invocable con un POST a la ruta pública del
  // evento, sin sesión. Mientras aquí hubo un `attendances: { include: { member } }`,
  // bastaba el id de un evento —que circula por WhatsApp en los enlaces que el
  // propio club comparte— para volcar el padrón entero: nombre, DNI, fecha de
  // nacimiento, teléfono, dirección y datos del tutor de cada menor inscrito.
  // Ninguna pantalla usaba esa lista; solo salía por la invocación directa.
  //
  // Si algún día hace falta la lista de inscritos, que la sirva una función
  // aparte con su comprobación de rol y un `select` explícito, nunca ampliando
  // este `include`.
  return runWithTenant(async () => {
  try {
    const event = await prisma.event.findUnique({
      where: { id },
      include: {
        group: true,
      },
    });
    if (!event) return { success: false, error: "Evento no encontrado" };
    return { success: true, data: event };
  } catch (error) {
    console.error("Error fetching event:", error);
    return { success: false, error: "Error al obtener el evento" };
  }
  });
}

export async function createEvent(data: {
  title: string;
  type: string;
  date: Date;
  endDate?: Date | null;
  location?: string | null;
  description?: string | null;
  isPublic: boolean;
  maxAttendees?: number | null;
  price?: number | null;
  groupId?: string | null;
}) {
  return runWithTenant(async () => {
  const auth = await assertEventStaff(data.groupId ?? null);
  if (!auth.ok) return { success: false, error: auth.error };
  try {
    const event = await prisma.event.create({
      data,
    });
    revalidatePath("/events");
    return { success: true, data: event };
  } catch (error) {
    console.error("Error creating event:", error);
    return { success: false, error: "Error al crear el evento" };
  }
  });
}

export async function updateEvent(
  id: string,
  data: {
    title?: string;
    type?: string;
    date?: Date;
    endDate?: Date | null;
    location?: string | null;
    description?: string | null;
    isPublic?: boolean;
    maxAttendees?: number | null;
    price?: number | null;
    status?: string;
    groupId?: string | null;
  }
) {
  return runWithTenant(async () => {
  const current = await prisma.event.findUnique({ where: { id }, select: { groupId: true } });
  if (!current) return { success: false, error: "Evento no encontrado" };
  // Autoriza sobre el equipo actual y, si se reasigna, también sobre el destino.
  const authCurrent = await assertEventStaff(current.groupId);
  if (!authCurrent.ok) return { success: false, error: authCurrent.error };
  if (data.groupId && data.groupId !== current.groupId) {
    const authTarget = await assertEventStaff(data.groupId);
    if (!authTarget.ok) return { success: false, error: authTarget.error };
  }
  try {
    const event = await prisma.event.update({
      where: { id },
      data,
    });
    revalidatePath("/events");
    revalidatePath(`/events/${id}`);
    return { success: true, data: event };
  } catch (error) {
    console.error("Error updating event:", error);
    return { success: false, error: "Error al actualizar el evento" };
  }
  });
}

export async function deleteEvent(id: string) {
  return runWithTenant(async () => {
  const current = await prisma.event.findUnique({ where: { id }, select: { groupId: true } });
  if (!current) return { success: false, error: "Evento no encontrado" };
  const auth = await assertEventStaff(current.groupId);
  if (!auth.ok) return { success: false, error: auth.error };
  try {
    await prisma.event.delete({
      where: { id },
    });
    revalidatePath("/events");
    return { success: true };
  } catch (error) {
    console.error("Error deleting event:", error);
    return { success: false, error: "Error al eliminar el evento" };
  }
  });
}
