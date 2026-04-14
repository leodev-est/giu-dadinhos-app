-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM (
    'PENDING',
    'CONFIRMED',
    'IN_PROGRESS',
    'COMPLETED',
    'CANCELED'
);

-- AlterTable
ALTER TABLE "Customer"
ADD CONSTRAINT "Customer_phone_key" UNIQUE ("phone");

-- AlterTable
ALTER TABLE "Order"
ALTER COLUMN "status" TYPE "OrderStatus" USING "status"::"OrderStatus",
ALTER COLUMN "status" SET DEFAULT 'PENDING',
ALTER COLUMN "totalPrice" TYPE DECIMAL(10, 2);

-- AlterTable
ALTER TABLE "OrderItem"
ALTER COLUMN "price" TYPE DECIMAL(10, 2),
DROP CONSTRAINT "OrderItem_orderId_fkey",
ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Product"
ALTER COLUMN "price" TYPE DECIMAL(10, 2);

-- CreateIndex
CREATE INDEX "Order_customerId_createdAt_idx" ON "Order"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "OrderItem_productId_idx" ON "OrderItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderItem_orderId_productId_key" ON "OrderItem"("orderId", "productId");
