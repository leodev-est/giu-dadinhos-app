// A coluna deliveryOrder existe em producao desde a migration 20260414213000.
// Retornar true diretamente elimina a query de introspeccao em cada request.
export async function hasOrderDeliveryOrderColumn(): Promise<boolean> {
  return true;
}
