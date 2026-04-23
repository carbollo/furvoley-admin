"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { registerForEvent } from "@/actions/events";
import { CheckCircle, Loader2 } from "lucide-react";

type Props = {
  eventId: string;
  isLoggedIn: boolean;
  hasMemberProfile: boolean;
  alreadyRegistered: boolean;
  isFull: boolean;
  notInTeam: boolean;
  isCancelled: boolean;
  hasPrice: boolean;
};

export function EventRegisterButton({
  eventId,
  isLoggedIn,
  hasMemberProfile,
  alreadyRegistered,
  isFull,
  notInTeam,
  isCancelled,
  hasPrice,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [localRegistered, setLocalRegistered] = useState(alreadyRegistered);

  const handleRegister = async () => {
    setMessage(null);
    setLoading(true);
    try {
      const res = await registerForEvent(eventId);
      if (res.success) {
        if (res.code === "ALREADY") {
          setLocalRegistered(true);
          setMessage({ type: "ok", text: "Ya estabas inscrito en este evento." });
        } else {
          setLocalRegistered(true);
          setMessage({ type: "ok", text: "¡Te has inscrito correctamente!" });
        }
        router.refresh();
      } else {
        const text =
          res.code === "LOGIN"
            ? "Debes iniciar sesión."
            : res.code === "NO_MEMBER"
              ? "Tu usuario no tiene ficha de socio."
              : res.code === "NOT_FOUND"
                ? "Evento no encontrado."
                : res.code === "CANCELLED"
                  ? "Este evento está cancelado."
                  : res.code === "NOT_IN_TEAM"
                    ? "Solo pueden inscribirse miembros de este equipo."
                    : res.code === "FULL"
                      ? "No quedan plazas disponibles."
                      : "No se pudo completar la inscripción.";
        setMessage({ type: "err", text });
      }
    } finally {
      setLoading(false);
    }
  };

  if (isCancelled) {
    return (
      <p className="text-center text-amber-800 bg-amber-50 border border-amber-200 rounded-lg py-3 px-4">
        Este evento está cancelado.
      </p>
    );
  }

  if (localRegistered) {
    return (
      <div className="space-y-4 text-center">
        <div className="inline-flex items-center gap-2 text-green-800 bg-green-50 border border-green-200 rounded-lg py-3 px-4">
          <CheckCircle className="h-5 w-5 shrink-0" />
          <span className="font-medium">Ya estás inscrito en este evento.</span>
        </div>
        {message?.type === "ok" && (
          <p className="text-sm text-gray-600">{message.text}</p>
        )}
        <Link
          href={`/calendar/${eventId}`}
          className="inline-block text-blue-600 hover:text-blue-800 font-medium text-sm"
        >
          Ver detalle en el calendario
        </Link>
      </div>
    );
  }

  if (isFull) {
    return (
      <p className="text-center text-gray-700 bg-gray-100 border border-gray-200 rounded-lg py-3 px-4">
        Plazas completas. No es posible inscribirse en este momento.
      </p>
    );
  }

  if (!isLoggedIn || !hasMemberProfile || notInTeam) {
    return null;
  }

  return (
    <div className="space-y-4 w-full max-w-md mx-auto">
      {hasPrice && (
        <p className="text-sm text-gray-600 text-center">
          Al inscribirte quedas apuntado como pendiente. El pago, si aplica, se gestionará aparte con el club.
        </p>
      )}
      {message && (
        <p
          className={`text-sm text-center rounded-lg py-2 px-3 ${
            message.type === "ok" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </p>
      )}
      <button
        type="button"
        onClick={handleRegister}
        disabled={loading}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold py-3 px-8 rounded-lg shadow-md transition text-lg flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            Procesando…
          </>
        ) : (
          "Inscribirse al evento"
        )}
      </button>
    </div>
  );
}
