import { prisma } from "@/lib/prisma";
import EventForm from "@/components/admin/events/EventForm";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { getEventById } from "@/actions/events";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const res = await getEventById(id);
  if (!res.success || !res.data) {
    notFound();
  }

  const teams = await prisma.team.findMany({
    orderBy: { name: "asc" },
  });

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-8">
        <Link
          href="/events"
          className="inline-flex items-center text-sm font-medium text-gray-500 hover:text-gray-700 mb-4 transition-colors"
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Volver a Eventos
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">Editar evento</h1>
        <p className="text-gray-500 mt-1">{res.data.title}</p>
      </div>

      <EventForm teams={teams} eventId={id} initialEvent={res.data} />
    </div>
  );
}
