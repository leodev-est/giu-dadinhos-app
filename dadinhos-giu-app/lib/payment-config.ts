const officialPixKey = "7635b4db-ac43-4021-b068-a150d2c80ba9";

export const pixConfig = {
  key: officialPixKey,
  formattedKey: officialPixKey,
};

export function hasPixKeyConfigured() {
  return Boolean(pixConfig.key);
}
