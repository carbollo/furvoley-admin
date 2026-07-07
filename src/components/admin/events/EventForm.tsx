"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createEvent, updateEvent } from "@/actions/events";
import { Calendar, Clock, MapPin, Users, Euro, FileText, Globe, Lock } from "lucide-react";

function toDateInputValue(d: Date | string) {
  const dt = new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toTimeInputValue(d: Date | string) {
  const dt = new Date(d);
  return `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
}

type InitialEvent = {
  title: string;
  type: string;
  date: Date | string;
  endDate: Date | string | null;
  location: string | null;
  description: string | null;
  isPublic: boolean;
  maxAttendees: number | null;
  price: number | null;
  groupId: string | null;
};

export default function EventForm({
  teams,
  eventId,
  initialEvent,
}: {
  teams: { id: string; name: string }[];
  eventId?: string;
  initialEvent?: InitialEvent;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);

    const dateStr = formData.get("date") as string;
    const timeStr = formData.get("time") as string;
    const date = new Date(`${dateStr}T${timeStr}`);

    const endDateStr = formData.get("endDate") as string;
    const endTimeStr = formData.get("endTime") as string;
    const endDate = endDateStr && endTimeStr ? new Date(`${endDateStr}T${endTimeStr}`) : null;

    const data = {
      title: formData.get("title") as string,
      type: formData.get("type") as string,
      date,
      endDate,
      location: (formData.get("location") as string) || null,
      description: (formData.get("description") as string) || null,
      isPublic: formData.get("isPublic") === "true",
      maxAttendees: formData.get("maxAttendees")
        ? parseInt(formData.get("maxAttendees") as string, 10)
        : null,
      price: formData.get("price") ? parseFloat(formData.get("price") as string) : null,
      groupId: (formData.get("groupId") as string) || null,
    };

    if (eventId) {
      const res = await updateEvent(eventId, data);
      if (res.success) {
        router.push("/events");
      } else {
        setError(res.error || "Error al actualizar el evento");
        setLoading(false);
      }
      return;
    }

    const res = await createEvent(data);

    if (res.success) {
      router.push("/events");
    } else {
      setError(res.error || "Error al crear el evento");
      setLoading(false);
    }
  };

  const i = initialEvent;

  return (
    <form onSubmit={handleSubmit} className="space-y-8 bg-white p-8 rounded-xl shadow-sm border border-stone-200">
      {error && (
        <div className="bg-red-50 border-l-4 border-red-400 p-4 text-red-700">
          <p>{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Título del Evento *</label>
            <input
              type="text"
              name="title"
              required
              defaultValue={i?.title}
              className="w-full rounded-md border border-stone-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Ej: Torneo de Verano 2026"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Tipo de Evento *</label>
              <select
                name="type"
                required
                defaultValue={i?.type}
                className="w-full rounded-md border border-stone-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="TRAINING">Entrenamiento</option>
                <option value="MATCH">Partido</option>
                <option value="TOURNAMENT">Torneo</option>
                <option value="SOCIAL">Social</option>
                <option value="OTHER">Otro</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Equipo (Opcional)</label>
              <select
                name="groupId"
                defaultValue={i?.groupId ?? ""}
                className="w-full rounded-md border border-stone-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Todo el club</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Fecha de Inicio *</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Calendar className="h-4 w-4 text-stone-400" />
                </div>
                <input
                  type="date"
                  name="date"
                  required
                  defaultValue={i ? toDateInputValue(i.date) : undefined}
                  className="w-full rounded-md border border-stone-300 pl-10 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Hora de Inicio *</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Clock className="h-4 w-4 text-stone-400" />
                </div>
                <input
                  type="time"
                  name="time"
                  required
                  defaultValue={i ? toTimeInputValue(i.date) : undefined}
                  className="w-full rounded-md border border-stone-300 pl-10 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Fecha de Fin (Opcional)</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Calendar className="h-4 w-4 text-stone-400" />
                </div>
                <input
                  type="date"
                  name="endDate"
                  defaultValue={i?.endDate ? toDateInputValue(i.endDate) : undefined}
                  className="w-full rounded-md border border-stone-300 pl-10 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Hora de Fin (Opcional)</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Clock className="h-4 w-4 text-stone-400" />
                </div>
                <input
                  type="time"
                  name="endTime"
                  defaultValue={i?.endDate ? toTimeInputValue(i.endDate) : undefined}
                  className="w-full rounded-md border border-stone-300 pl-10 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Ubicación</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <MapPin className="h-4 w-4 text-stone-400" />
              </div>
              <input
                type="text"
                name="location"
                defaultValue={i?.location ?? undefined}
                className="w-full rounded-md border border-stone-300 pl-10 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Ej: Polideportivo Municipal"
              />
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Visibilidad *</label>
            <div className="grid grid-cols-2 gap-4">
              <label className="flex items-center p-4 border border-stone-200 rounded-lg cursor-pointer hover:bg-stone-50 transition-colors">
                <input
                  type="radio"
                  name="isPublic"
                  value="false"
                  defaultChecked={i ? !i.isPublic : true}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-stone-300"
                />
                <div className="ml-3 flex flex-col">
                  <span className="block text-sm font-medium text-stone-900 flex items-center">
                    <Lock className="w-4 h-4 mr-1" /> Privado
                  </span>
                  <span className="block text-xs text-stone-500">Solo miembros del club</span>
                </div>
              </label>
              <label className="flex items-center p-4 border border-stone-200 rounded-lg cursor-pointer hover:bg-stone-50 transition-colors">
                <input
                  type="radio"
                  name="isPublic"
                  value="true"
                  defaultChecked={i ? i.isPublic : false}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-stone-300"
                />
                <div className="ml-3 flex flex-col">
                  <span className="block text-sm font-medium text-stone-900 flex items-center">
                    <Globe className="w-4 h-4 mr-1" /> Público
                  </span>
                  <span className="block text-xs text-stone-500">Cualquiera con el enlace</span>
                </div>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Aforo Máximo</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Users className="h-4 w-4 text-stone-400" />
                </div>
                <input
                  type="number"
                  name="maxAttendees"
                  min="1"
                  defaultValue={i?.maxAttendees ?? undefined}
                  className="w-full rounded-md border border-stone-300 pl-10 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Sin límite"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Precio de Entrada (€)</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Euro className="h-4 w-4 text-stone-400" />
                </div>
                <input
                  type="number"
                  name="price"
                  min="0"
                  step="0.01"
                  defaultValue={i?.price ?? undefined}
                  className="w-full rounded-md border border-stone-300 pl-10 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="0.00 (Gratis)"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Descripción</label>
            <div className="relative">
              <div className="absolute top-3 left-3 pointer-events-none">
                <FileText className="h-4 w-4 text-stone-400" />
              </div>
              <textarea
                name="description"
                rows={5}
                defaultValue={i?.description ?? undefined}
                className="w-full rounded-md border border-stone-300 pl-10 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Detalles sobre el evento..."
              />
            </div>
          </div>
        </div>
      </div>

      <div className="pt-6 border-t border-stone-200 flex justify-end space-x-4">
        <button
          type="button"
          onClick={() => router.back()}
          className="px-6 py-2 border border-stone-300 rounded-md text-stone-700 hover:bg-stone-50 font-medium transition-colors"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
        >
          {loading ? (eventId ? "Guardando..." : "Creando...") : eventId ? "Guardar cambios" : "Crear Evento"}
        </button>
      </div>
    </form>
  );
}
