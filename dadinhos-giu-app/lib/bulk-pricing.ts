export type BulkPricingRule = {
  bulkMinQty: number | null;
  bulkPrice: number | null;
};

export function calculateBulkLineTotal(
  unitPrice: number,
  quantity: number,
  rule: BulkPricingRule,
): number {
  const { bulkMinQty, bulkPrice } = rule;
  if (bulkMinQty !== null && bulkPrice !== null && quantity >= bulkMinQty) {
    const bundles = Math.floor(quantity / bulkMinQty);
    const leftover = quantity % bulkMinQty;
    return bundles * bulkPrice + leftover * unitPrice;
  }
  return unitPrice * quantity;
}

export function getEffectiveUnitPrice(
  unitPrice: number,
  quantity: number,
  rule: BulkPricingRule,
): number {
  if (quantity === 0) return unitPrice;
  return calculateBulkLineTotal(unitPrice, quantity, rule) / quantity;
}

export function hasBulkPromotion(quantity: number, rule: BulkPricingRule): boolean {
  return (
    rule.bulkMinQty !== null &&
    rule.bulkPrice !== null &&
    quantity >= rule.bulkMinQty
  );
}
