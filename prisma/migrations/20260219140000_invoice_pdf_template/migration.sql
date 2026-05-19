-- Plantilla PDF de factura (CLASSIC | MODERN | COMPACT).
ALTER TABLE "ClubSettings" ADD COLUMN "invoicePdfTemplate" TEXT NOT NULL DEFAULT 'CLASSIC';
