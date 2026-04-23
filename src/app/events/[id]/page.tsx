import { getEventById } from "@/actions/events";
import { notFound } from "next/navigation";
import { Calendar, MapPin, Users, Euro, Clock } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function PublicEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { data: event, success } = await getEventById(id);

  if (!success || !event) {
    notFound();
  }

  // Si el evento no es público, podríamos restringir el acceso,
  // pero como el admin comparte el enlace, asumimos que si tienen el enlace pueden verlo.
  // Aún así, podemos mostrar un aviso si es privado.

  const isFree = !event.price || event.price === 0;

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-xl overflow-hidden">
        {/* Cabecera del evento */}
        <div className="bg-blue-600 px-8 py-10 text-white">
          <div className="flex justify-between items-start">
            <div>
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-500 text-white mb-4">
                {event.type}
              </span>
              <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl mb-2">
                {event.title}
              </h1>
              {event.team && (
                <p className="text-blue-100 text-lg">
                  Organizado para: {event.team.name}
                </p>
              )}
            </div>
            <div className="text-right">
              <div className="text-4xl font-bold bg-white text-blue-600 px-4 py-2 rounded-lg shadow-sm">
                {isFree ? "GRATIS" : `${event.price}€`}
              </div>
            </div>
          </div>
        </div>

        {/* Detalles del evento */}
        <div className="px-8 py-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
            <div className="space-y-4">
              <div className="flex items-center text-gray-700">
                <Calendar className="h-6 w-6 text-blue-500 mr-3" />
                <div>
                  <p className="text-sm text-gray-500 font-medium">Fecha</p>
                  <p className="font-semibold">
                    {new Date(event.date).toLocaleDateString("es-ES", {
                      weekday: "long",
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </p>
                </div>
              </div>

              <div className="flex items-center text-gray-700">
                <Clock className="h-6 w-6 text-blue-500 mr-3" />
                <div>
                  <p className="text-sm text-gray-500 font-medium">Hora</p>
                  <p className="font-semibold">
                    {new Date(event.date).toLocaleTimeString("es-ES", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>

              {event.location && (
                <div className="flex items-center text-gray-700">
                  <MapPin className="h-6 w-6 text-blue-500 mr-3" />
                  <div>
                    <p className="text-sm text-gray-500 font-medium">Lugar</p>
                    <p className="font-semibold">{event.location}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-4">
              {event.maxAttendees && (
                <div className="flex items-center text-gray-700">
                  <Users className="h-6 w-6 text-blue-500 mr-3" />
                  <div>
                    <p className="text-sm text-gray-500 font-medium">Aforo</p>
                    <p className="font-semibold">
                      Limitado a {event.maxAttendees} personas
                    </p>
                  </div>
                </div>
              )}
              
              {!event.isPublic && (
                <div className="inline-flex items-center px-3 py-1 rounded-md text-sm font-medium bg-yellow-100 text-yellow-800 mt-4">
                  Evento Privado
                </div>
              )}
            </div>
          </div>

          {event.description && (
            <div className="border-t border-gray-200 pt-8 mb-8">
              <h3 className="text-xl font-bold text-gray-900 mb-4">
                Sobre este evento
              </h3>
              <div className="prose prose-blue max-w-none text-gray-600 whitespace-pre-wrap">
                {event.description}
              </div>
            </div>
          )}

          <div className="border-t border-gray-200 pt-8 flex justify-center">
            <button className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-lg shadow-md transition duration-300 ease-in-out transform hover:-translate-y-1 text-lg w-full md:w-auto">
              Inscribirse al Evento
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
