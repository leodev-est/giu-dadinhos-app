-- Product: imagem e peso em gramas
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "gramWeight" INTEGER;

-- Order: taxa de entrega, cupom, primeiro pedido
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "deliveryFee" DECIMAL(10, 2);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "couponId" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "couponDiscount" DECIMAL(10, 2);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "isFirstOrder" BOOLEAN NOT NULL DEFAULT false;

-- AppSetting
CREATE TABLE IF NOT EXISTS "AppSetting" (
  "key"   TEXT NOT NULL,
  "value" TEXT NOT NULL,
  CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CouponType enum
DO $$ BEGIN
  CREATE TYPE "CouponType" AS ENUM ('PERCENTAGE', 'FIXED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Coupon
CREATE TABLE IF NOT EXISTS "Coupon" (
  "id"         TEXT NOT NULL,
  "code"       TEXT NOT NULL,
  "type"       "CouponType" NOT NULL,
  "value"      DECIMAL(10, 2) NOT NULL,
  "active"     BOOLEAN NOT NULL DEFAULT true,
  "maxUsage"   INTEGER,
  "usageCount" INTEGER NOT NULL DEFAULT 0,
  "expiresAt"  TIMESTAMP(3),
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Coupon_code_key" ON "Coupon"("code");

-- LoyaltyCard
CREATE TABLE IF NOT EXISTS "LoyaltyCard" (
  "id"              TEXT NOT NULL,
  "customerId"      TEXT NOT NULL,
  "totalGrams"      INTEGER NOT NULL DEFAULT 0,
  "stars"           INTEGER NOT NULL DEFAULT 0,
  "redeemedRewards" INTEGER NOT NULL DEFAULT 0,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LoyaltyCard_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "LoyaltyCard_customerId_key" ON "LoyaltyCard"("customerId");

-- Foreign keys (PostgreSQL nao suporta ADD CONSTRAINT IF NOT EXISTS, usa DO block)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Order_couponId_fkey'
  ) THEN
    ALTER TABLE "Order" ADD CONSTRAINT "Order_couponId_fkey"
      FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'LoyaltyCard_customerId_fkey'
  ) THEN
    ALTER TABLE "LoyaltyCard" ADD CONSTRAINT "LoyaltyCard_customerId_fkey"
      FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
