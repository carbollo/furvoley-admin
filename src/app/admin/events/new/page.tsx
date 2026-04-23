import { prisma } from "@/lib/prisma";
import EventForm from "@/components/admin/events/EventForm";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function NewEventPage() {
  const teams = await prisma.team.findMany({
    orderBy: { name: "asc" },
  });

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-8">
        <Link
          href="/admin/events"
          className="inline-flex items-center text-sm font-medium text-gray-500 hover:text-gray-700 mb-4 transition-colors"
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Volver a Eventos
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">Crear Nuevo Evento</h1>
        <p className="text-gray-500 mt-1">
          Configura los detalles del evento, aforo, precio y visibilidad.
        </p>
      </div>

      <EventForm teams={teams} />
    </div>
  );
}
