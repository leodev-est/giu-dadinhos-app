-- Add simple stock control to products
ALTER TABLE "Product"
ADD COLUMN "stockQuantity" INTEGER NOT NULL DEFAULT 0;
