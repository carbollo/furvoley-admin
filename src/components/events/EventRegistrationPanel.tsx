"use client";

import Link from "next/link";
import { EventGuestForm } from "./EventGuestForm";
import { EventRegisterButton } from "./EventRegisterButton";

type Props = {
  eventId: string;
  isLoggedIn: boolean;
  hasMemberProfile: boolean;
  alreadyRegistered: boolean;
  notInTeam: boolean;
  isCancelled: boolean;
  hasPrice: boolean;
  spotsLeft: number | null;
};

export function EventRegistrationPanel({
  eventId,
  isLoggedIn,
  hasMemberProfile,
  alreadyRegistered,
  notInTeam,
  isCancelled,
  hasPrice,
  spotsLeft,
}: Props) {
  const callbackUrl = `/events/${eventId}`;

  if (isCancelled) {
    return (
      <p className="text-center text-amber-800 bg-amber-50 border border-amber-200 rounded-lg py-3 px-4">
        Este evento está cancelado.
      </p>
    );
  }

  if (alreadyRegistered) {
    return (
      <EventRegisterButton
        eventId={eventId}
        isLoggedIn={isLoggedIn}
        hasMemberProfile={hasMemberProfile}
        alreadyRegistered={alreadyRegistered}
        isFull={false}
        notInTeam={notInTeam}
        isCancelled={isCancelled}
        hasPrice={hasPrice}
      />
    );
  }

  const isFull = spotsLeft !== null && spotsLeft <= 0;

  if (isFull) {
    return (
      <p className="text-center text-gray-700 bg-gray-100 border border-gray-200 rounded-lg py-3 px-4">
        Plazas completas. No es posible inscribirse en este momento.
      </p>
    );
  }

  const showMemberBlock = isLoggedIn && hasMemberProfile && !notInTeam;

  return (
    <div className="space-y-10 w-full max-w-lg mx-auto">
      <EventGuestForm eventId={eventId} spotsLeft={spotsLeft} hasPrice={hasPrice} />

      <div className="relative">
        <div className="absolute inset-0 flex items-center" aria-hidden>
          <div className="w-full border-t border-gray-200" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="bg-white px-3 text-gray-500">o</span>
        </div>
      </div>

      {showMemberBlock ? (
        <div className="space-y-3 text-center">
          <p className="text-sm font-medium text-gray-700">Socio del club</p>
          <EventRegisterButton
            eventId={eventId}
            isLoggedIn={isLoggedIn}
            hasMemberProfile={hasMemberProfile}
            alreadyRegistered={false}
            isFull={false}
            notInTeam={false}
            isCancelled={isCancelled}
            hasPrice={hasPrice}
          />
        </div>
      ) : (
        <div className="space-y-3 text-center text-sm text-gray-600">
          {!isLoggedIn ? (
            <p>
              ¿Eres socio con cuenta?{" "}
              <Link
                href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`}
                className="text-blue-600 font-medium hover:underline"
              >
                Inicia sesión
              </Link>{" "}
              para apuntarte con tu ficha de socio.
            </p>
          ) : !hasMemberProfile ? (
            <p className="text-gray-500">
              Tu cuenta no tiene ficha de socio. Puedes usar el formulario de invitado o pedir al club que vincule tu
              usuario.
            </p>
          ) : null}
        </div>
      )}

      {isLoggedIn && hasMemberProfile && notInTeam && (
        <p className="text-center text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg py-2 px-3">
          Este evento está asociado a un equipo del que no formas parte; puedes inscribirte como invitado arriba.
        </p>
      )}
    </div>
  );
}
