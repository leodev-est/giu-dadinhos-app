DROP INDEX IF EXISTS "Order_paymentExternalId_idx";
DROP INDEX IF EXISTS "Order_paymentStatus_paymentProvider_idx";

ALTER TABLE "Customer"
DROP COLUMN IF EXISTS "cpfCnpj";

ALTER TABLE "Order"
DROP COLUMN IF EXISTS "paymentProvider",
DROP COLUMN IF EXISTS "paymentExternalId",
DROP COLUMN IF EXISTS "paymentQrCode",
DROP COLUMN IF EXISTS "paymentQrCodeImage",
DROP COLUMN IF EXISTS "paymentExpiresAt",
ADD COLUMN IF NOT EXISTS "paymentReceiptNote" TEXT;

DROP TYPE IF EXISTS "PaymentProvider";

CREATE INDEX IF NOT EXISTS "Order_paymentStatus_idx"
ON "Order"("paymentStatus");
