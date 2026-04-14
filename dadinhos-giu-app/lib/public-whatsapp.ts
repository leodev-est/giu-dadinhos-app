export const officialWhatsAppPhone = "5511984534601";

export function buildPublicWhatsAppUrl(message: string) {
  return `https://wa.me/${officialWhatsAppPhone}?text=${encodeURIComponent(message)}`;
}

