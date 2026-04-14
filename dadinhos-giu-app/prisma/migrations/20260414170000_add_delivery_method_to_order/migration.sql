-- Create delivery method enum and add field to orders
CREATE TYPE "DeliveryMethod" AS ENUM ('DELIVERY', 'PICKUP');

ALTER TABLE "Order"
ADD COLUMN "deliveryMethod" "DeliveryMethod" NOT NULL DEFAULT 'DELIVERY';
