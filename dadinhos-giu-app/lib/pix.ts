const PIX_GUI = "br.gov.bcb.pix";
const MERCHANT_NAME = "DADINHOS DA GIU";
const MERCHANT_CITY = "SAO PAULO";
const CURRENCY_BRL = "986";
const COUNTRY_CODE = "BR";

function normalizePixText(value: string, maxLength: number) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .slice(0, maxLength);
}

function formatPixField(id: string, value: string) {
  const size = value.length.toString().padStart(2, "0");
  return `${id}${size}${value}`;
}

function crc16(payload: string) {
  let crc = 0xffff;

  for (let index = 0; index < payload.length; index += 1) {
    crc ^= payload.charCodeAt(index) << 8;

    for (let bit = 0; bit < 8; bit += 1) {
      if ((crc & 0x8000) !== 0) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc <<= 1;
      }

      crc &= 0xffff;
    }
  }

  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function buildPixPayload(input: {
  pixKey: string;
  amount?: number | null;
  description?: string;
  txid?: string;
}) {
  const merchantAccount = formatPixField(
    "26",
    `${formatPixField("00", PIX_GUI)}${formatPixField("01", input.pixKey)}`,
  );

  const txid = normalizePixText(input.txid?.trim() || "***", 25) || "***";
  const amount =
    typeof input.amount === "number" && input.amount > 0
      ? formatPixField("54", input.amount.toFixed(2))
      : "";

  const payloadWithoutCrc = [
    formatPixField("00", "01"),
    merchantAccount,
    formatPixField("52", "0000"),
    formatPixField("53", CURRENCY_BRL),
    amount,
    formatPixField("58", COUNTRY_CODE),
    formatPixField("59", normalizePixText(MERCHANT_NAME, 25)),
    formatPixField("60", normalizePixText(MERCHANT_CITY, 15)),
    formatPixField("62", formatPixField("05", txid)),
    "6304",
  ].join("");

  return `${payloadWithoutCrc}${crc16(payloadWithoutCrc)}`;
}
