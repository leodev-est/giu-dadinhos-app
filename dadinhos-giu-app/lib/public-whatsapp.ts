export const officialWhatsAppPhone = "5511984534601";

export function buildPublicWhatsAppUrl(message: string) {
  return `https://wa.me/${officialWhatsAppPhone}?text=${encodeURIComponent(message)}`;
}

export function formatOfficialPhone(phone = officialWhatsAppPhone) {
  const digits = phone.replace(/\D/g, "");

  if (digits.length === 13 && digits.startsWith("55")) {
    return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(
      4,
      9,
    )}-${digits.slice(9)}`;
  }

  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }

  return phone;
}
