ALTER TABLE "Order"
ADD COLUMN "deliveryOrder" INTEGER;

CREATE INDEX "Order_desiredDate_deliveryMethod_deliveryOrder_idx"
ON "Order"("desiredDate", "deliveryMethod", "deliveryOrder");

