"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

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
    revalidatePath("/admin/events");
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
    revalidatePath("/admin/events");
    revalidatePath(`/admin/events/${id}`);
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
    revalidatePath("/admin/events");
    return { success: true };
  } catch (error) {
    console.error("Error deleting event:", error);
    return { success: false, error: "Error al eliminar el evento" };
  }
}
