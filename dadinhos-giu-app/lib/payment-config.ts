const officialPixKey = process.env.NEXT_PUBLIC_PIX_KEY?.trim() || "11984534601";

export const pixConfig = {
  key: officialPixKey,
  formattedKey: officialPixKey,
};

export function hasPixKeyConfigured() {
  return Boolean(pixConfig.key);
}
