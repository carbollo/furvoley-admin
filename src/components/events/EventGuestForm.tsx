"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { registerGuestAttendees } from "@/actions/events";
import { CheckCircle, Loader2, Plus, Trash2, UserPlus } from "lucide-react";

type Row = { key: string; firstName: string; lastName: string; dni: string };

function newRow(): Row {
  return {
    key: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    firstName: "",
    lastName: "",
    dni: "",
  };
}

type Props = {
  eventId: string;
  spotsLeft: number | null;
  hasPrice: boolean;
};

export function EventGuestForm({ eventId, spotsLeft, hasPrice }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(() => [newRow()]);
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ count: number } | null>(null);

  const canAddRow = rows.length < (spotsLeft === null ? 20 : Math.min(20, spotsLeft));

  const addRow = () => {
    if (!canAddRow) return;
    setRows((r) => [...r, newRow()]);
  };

  const removeRow = (key: string) => {
    setRows((r) => (r.length <= 1 ? r : r.filter((x) => x.key !== key)));
  };

  const updateRow = (key: string, field: keyof Omit<Row, "key">, value: string) => {
    setRows((r) => r.map((row) => (row.key === key ? { ...row, [field]: value } : row)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await registerGuestAttendees(
        eventId,
        rows.map((r) => ({
          firstName: r.firstName,
          lastName: r.lastName,
          dni: r.dni,
        })),
        phone
      );
      if (res.success) {
        setDone({ count: res.count });
        router.refresh();
      } else {
        setError(res.error);
      }
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-6 text-center space-y-2">
        <CheckCircle className="h-10 w-10 text-green-600 mx-auto" />
        <p className="font-semibold text-green-900">
          Inscripción recibida: {done.count} {done.count === 1 ? "entrada" : "entradas"}.
        </p>
        <p className="text-sm text-green-800">
          Guarda esta página o el correo de confirmación si lo hubiera. El club puede contactarte por teléfono si hace
          falta.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 text-left">
      <div className="flex items-center gap-2 text-gray-900 font-semibold">
        <UserPlus className="h-5 w-5 text-blue-600" />
        Inscripción (invitado / público)
      </div>
      {hasPrice && (
        <p className="text-sm text-gray-600">
          Precio por entrada según el evento. El pago lo coordinará el club contigo (transferencia, taquilla, etc.).
        </p>
      )}
      {spotsLeft !== null && (
        <p className="text-sm text-gray-600">
          Plazas disponibles: <span className="font-medium text-gray-900">{spotsLeft}</span>
        </p>
      )}

      {rows.map((row, index) => (
        <div
          key={row.key}
          className="rounded-lg border border-gray-200 bg-gray-50/80 p-4 space-y-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">
              {index === 0 ? "Titular (contacto)" : `Entrada ${index + 1}`}
            </span>
            {index > 0 && (
              <button
                type="button"
                onClick={() => removeRow(row.key)}
                className="text-rose-600 hover:text-rose-800 p-1 rounded"
                aria-label="Quitar entrada"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nombre *</label>
              <input
                required
                value={row.firstName}
                onChange={(e) => updateRow(row.key, "firstName", e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                autoComplete="given-name"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Apellidos *</label>
              <input
                required
                value={row.lastName}
                onChange={(e) => updateRow(row.key, "lastName", e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                autoComplete="family-name"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">DNI / NIE *</label>
              <input
                required
                value={row.dni}
                onChange={(e) => updateRow(row.key, "dni", e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm uppercase"
                autoComplete="off"
              />
            </div>
            {index === 0 && (
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Teléfono *</label>
                <input
                  required
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  autoComplete="tel"
                  placeholder="Ej: 612 345 678"
                />
              </div>
            )}
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={addRow}
        disabled={!canAddRow}
        className="inline-flex items-center gap-2 text-sm font-medium text-blue-700 hover:text-blue-900 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Plus className="h-4 w-4" />
        Añadir otra entrada
        {spotsLeft !== null && rows.length >= spotsLeft ? " (sin plazas)" : ""}
      </button>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm px-4 py-3">{error}</div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold py-3 px-6 rounded-lg shadow-md transition flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            Enviando…
          </>
        ) : (
          `Confirmar ${rows.length === 1 ? "1 entrada" : `${rows.length} entradas`}`
        )}
      </button>
    </form>
  );
}
