"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

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

  const existing = await prisma.attendance.findUnique({
    where: {
      eventId_memberId: { eventId, memberId },
    },
  });

  if (existing?.status === "PENDING" || existing?.status === "PRESENT") {
    return { success: true, code: "ALREADY" };
  }

  if (event.maxAttendees != null && registrationCount >= event.maxAttendees) {
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
          select: { attendances: true },
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
