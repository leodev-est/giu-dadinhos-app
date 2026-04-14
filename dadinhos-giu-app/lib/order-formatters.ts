type OrderAddressInput = {
  zipCode?: string | null;
  street?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  addressNumber?: string | null;
  addressComplement?: string | null;
};

export type DeliveryMethod = "DELIVERY" | "PICKUP";

export function formatOrderDesiredDate(desiredDate?: string | null) {
  if (!desiredDate) {
    return null;
  }

  const [year, month, day] = desiredDate.split("-");

  if (!year || !month || !day) {
    return desiredDate;
  }

  return `${day}/${month}/${year}`;
}

export function formatZipCode(zipCode?: string | null) {
  if (!zipCode) {
    return "";
  }

  const digits = zipCode.replace(/\D/g, "").slice(0, 8);

  if (digits.length <= 5) {
    return digits;
  }

  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

export function formatOrderAddress(address: OrderAddressInput) {
  const lineParts = [
    address.street,
    address.addressNumber,
    address.addressComplement,
  ].filter(Boolean);

  const locationParts = [
    address.neighborhood,
    address.city ? `${address.city}${address.state ? `/${address.state}` : ""}` : address.state,
  ].filter(Boolean);

  const fullAddress = [lineParts.join(", "), locationParts.join(" - ")]
    .filter(Boolean)
    .join(" - ");

  return fullAddress || null;
}

export function formatDeliveryMethodLabel(deliveryMethod?: DeliveryMethod | null) {
  if (deliveryMethod === "PICKUP") {
    return "Retirada";
  }

  return "Entrega";
}
