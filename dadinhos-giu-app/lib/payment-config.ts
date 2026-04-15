import {
  formatOfficialPhone,
  officialWhatsAppPhone,
} from "@/lib/public-whatsapp";

export const pixConfig = {
  key: officialWhatsAppPhone,
  formattedKey: formatOfficialPhone(officialWhatsAppPhone),
};

export function hasPixKeyConfigured() {
  return Boolean(pixConfig.key);
}

