import { getEvents } from "@/actions/events";
import Link from "next/link";
import { Plus, Calendar, MapPin, Users, Globe, Lock } from "lucide-react";
import CopyLinkButton from "@/components/admin/events/CopyLinkButton";

export const dynamic = "force-dynamic";

export default async function EventsAdminPage() {
  const { data: events, success } = await getEvents();

  if (!success) {
    return <div className="p-8 text-red-500">Error al cargar los eventos.</div>;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Eventos</h1>
          <p className="text-gray-500 mt-1">
            Gestiona entrenamientos, partidos, torneos y eventos públicos.
          </p>
        </div>
        <Link
          href="/events/new"
          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium shadow-sm"
        >
          <Plus className="w-5 h-5 mr-2" />
          Nuevo Evento
        </Link>
      </div>

      <div className="bg-white shadow-sm rounded-lg border border-gray-200 overflow-hidden">
        {events && events.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Evento
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Fecha y Lugar
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Visibilidad
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Aforo / Precio
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {events.map((event) => (
                  <tr key={event.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-gray-900">
                          {event.title}
                        </span>
                        <span className="text-xs text-gray-500 mt-1 inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 w-fit">
                          {event.type}
                        </span>
                        {event.team && (
                          <span className="text-xs text-blue-600 mt-1">
                            Equipo: {event.team.name}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col text-sm text-gray-500 space-y-1">
                        <div className="flex items-center">
                          <Calendar className="w-4 h-4 mr-2 text-gray-400" />
                          {new Date(event.date).toLocaleDateString("es-ES", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                        {event.location && (
                          <div className="flex items-center">
                            <MapPin className="w-4 h-4 mr-2 text-gray-400" />
                            {event.location}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {event.isPublic ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          <Globe className="w-3 h-3 mr-1" /> Público
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                          <Lock className="w-3 h-3 mr-1" /> Privado
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col text-sm text-gray-500 space-y-1">
                        <div className="flex items-center">
                          <Users className="w-4 h-4 mr-2 text-gray-400" />
                          {(event._count?.attendances || 0) + (event._count?.guestAttendees || 0)}
                          {event.maxAttendees ? ` / ${event.maxAttendees}` : " inscritos"}
                          {(event._count?.guestAttendees || 0) > 0 && (
                            <span className="ml-1 text-xs text-gray-400">
                              ({event._count?.guestAttendees} invit.)
                            </span>
                          )}
                        </div>
                        <div className="text-gray-900 font-medium">
                          {event.price ? `${event.price}€` : "Gratis"}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-medium space-x-2">
                      <CopyLinkButton eventId={event.id} />
                      <Link
                        href={`/events/${event.id}`}
                        target="_blank"
                        className="text-blue-600 hover:text-blue-900 px-2 py-1"
                      >
                        Ver
                      </Link>
                      <Link
                        href={`/events/${event.id}/edit`}
                        className="text-indigo-600 hover:text-indigo-900 px-2 py-1"
                      >
                        Editar
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <Calendar className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No hay eventos</h3>
            <p className="mt-1 text-sm text-gray-500">
              Comienza creando un nuevo evento para tu club.
            </p>
            <div className="mt-6">
              <Link
                href="/events/new"
                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="w-5 h-5 mr-2" />
                Nuevo Evento
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
