CREATE TYPE "PaymentProvider" AS ENUM ('MANUAL_PIX', 'ASAAS');

CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED', 'EXPIRED');

ALTER TABLE "Order"
ADD COLUMN "paymentProvider" "PaymentProvider" NOT NULL DEFAULT 'MANUAL_PIX',
ADD COLUMN "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "paymentExternalId" TEXT,
ADD COLUMN "paymentQrCode" TEXT,
ADD COLUMN "paymentQrCodeImage" TEXT,
ADD COLUMN "paymentExpiresAt" TIMESTAMP(3),
ADD COLUMN "paidAt" TIMESTAMP(3);

CREATE INDEX "Order_paymentStatus_paymentProvider_idx"
ON "Order"("paymentStatus", "paymentProvider");

CREATE INDEX "Order_paymentExternalId_idx"
ON "Order"("paymentExternalId");
