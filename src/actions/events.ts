"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

function normalizeDni(dni: string): string {
  return dni.trim().toUpperCase().replace(/\s+/g, "");
}

function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

export async function registerGuestAttendees(
  eventId: string,
  attendees: { firstName: string; lastName: string; dni: string }[],
  contactPhone: string
): Promise<{ success: true; count: number } | { success: false; error: string }> {
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
      select: { id: true, status: true, maxAttendees: true },
    });
    if (!event) {
      return { success: false, error: "Evento no encontrado." };
    }
    if (event.status === "CANCELLED") {
      return { success: false, error: "Este evento está cancelado." };
    }

    const memberSlots = await prisma.attendance.count({
      where: { eventId, status: { in: ["PENDING", "PRESENT"] } },
    });
    const guestSlots = await prisma.eventGuestAttendee.count({ where: { eventId } });
    const taken = memberSlots + guestSlots;
    if (event.maxAttendees != null && taken + normalized.length > event.maxAttendees) {
      return { success: false, error: "No hay plazas suficientes para todas las entradas." };
    }

    const conflict = await prisma.eventGuestAttendee.findFirst({
      where: {
        eventId,
        dni: { in: dnis },
      },
    });
    if (conflict) {
      return { success: false, error: "Algún DNI ya está inscrito en este evento." };
    }

    await prisma.eventGuestAttendee.createMany({
      data: normalized.map((a, i) => ({
        eventId,
        firstName: a.firstName,
        lastName: a.lastName,
        dni: a.dni,
        phone: i === 0 ? phoneDigits : null,
      })),
    });

    revalidatePath(`/events/${eventId}`);
    revalidatePath("/events");
    revalidatePath(`/calendar/${eventId}`);
    revalidatePath("/calendar");

    return { success: true, count: normalized.length };
  } catch (e: unknown) {
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
    select: { id: true, status: true, teamId: true, maxAttendees: true },
  });

  if (!event) {
    return { success: false, code: "NOT_FOUND" };
  }
  if (event.status === "CANCELLED") {
    return { success: false, code: "CANCELLED" };
  }

  if (event.teamId) {
    const inTeam = await prisma.teamMember.findUnique({
      where: {
        teamId_memberId: { teamId: event.teamId, memberId },
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
}

export async function getEvents() {
  try {
    const events = await prisma.event.findMany({
      orderBy: { date: "asc" },
      include: {
        team: true,
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
}

export async function getEventById(id: string) {
  try {
    const event = await prisma.event.findUnique({
      where: { id },
      include: {
        team: true,
        attendances: {
          include: {
            member: true,
          },
        },
      },
    });
    if (!event) return { success: false, error: "Evento no encontrado" };
    return { success: true, data: event };
  } catch (error) {
    console.error("Error fetching event:", error);
    return { success: false, error: "Error al obtener el evento" };
  }
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
  teamId?: string | null;
}) {
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
    teamId?: string | null;
  }
) {
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
}

export async function deleteEvent(id: string) {
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
}
