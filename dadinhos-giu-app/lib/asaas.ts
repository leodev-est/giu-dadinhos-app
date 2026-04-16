const ASAAS_SANDBOX_BASE_URL = "https://api-sandbox.asaas.com/v3";
const ASAAS_PRODUCTION_BASE_URL = "https://api.asaas.com/v3";

export class AsaasRequestError extends Error {
  status: number;
  path: string;
  responseBody: string;

  constructor(input: { status: number; path: string; responseBody: string }) {
    super(
      `Asaas error ${input.status} on ${input.path}: ${input.responseBody || "unknown error"}`,
    );
    this.name = "AsaasRequestError";
    this.status = input.status;
    this.path = input.path;
    this.responseBody = input.responseBody;
  }
}

export type AsaasDynamicPixPayment = {
  provider: "ASAAS";
  kind: "DYNAMIC_PIX";
  externalId: string;
  pixCopyAndPaste: string;
  qrCodeImage: string | null;
  expiresAt: string | null;
};

type AsaasCustomerResponse = {
  id: string;
};

type AsaasPaymentResponse = {
  id: string;
};

type AsaasPixQrCodeResponse = {
  encodedImage?: string | null;
  payload?: string | null;
  expirationDate?: string | null;
};

function getAsaasApiKey() {
  return process.env.ASAAS_API_KEY?.trim() ?? "";
}

function getAsaasBaseUrl() {
  return process.env.ASAAS_ENVIRONMENT === "production"
    ? ASAAS_PRODUCTION_BASE_URL
    : ASAAS_SANDBOX_BASE_URL;
}

function normalizeAsaasPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");

  if (digits.length === 13 && digits.startsWith("55")) {
    return digits.slice(2);
  }

  return digits;
}

function getAsaasHeaders() {
  return {
    "Content-Type": "application/json",
    access_token: getAsaasApiKey(),
  };
}

function getTodayDateInSaoPaulo() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function asaasFetch<T>(path: string, init?: RequestInit) {
  const response = await fetch(`${getAsaasBaseUrl()}${path}`, {
    ...init,
    headers: {
      ...getAsaasHeaders(),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const errorBody = await response.text();

    throw new AsaasRequestError({
      status: response.status,
      path,
      responseBody: errorBody || "unknown error",
    });
  }

  return (await response.json()) as T;
}

async function createAsaasCustomer(input: {
  name: string;
  phone: string;
  cpfCnpj: string;
}) {
  return asaasFetch<AsaasCustomerResponse>("/customers", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      mobilePhone: normalizeAsaasPhone(input.phone),
      cpfCnpj: input.cpfCnpj.replace(/\D/g, ""),
    }),
  });
}

async function createAsaasPixCharge(input: {
  customerId: string;
  orderId: string;
  totalPrice: number;
  dueDate?: string | null;
}) {
  return asaasFetch<AsaasPaymentResponse>("/payments", {
    method: "POST",
    body: JSON.stringify({
      customer: input.customerId,
      billingType: "PIX",
      value: input.totalPrice,
      dueDate: input.dueDate || getTodayDateInSaoPaulo(),
      description: `Pedido ${input.orderId}`,
      externalReference: input.orderId,
    }),
  });
}

async function getAsaasPixQrCode(paymentId: string) {
  return asaasFetch<AsaasPixQrCodeResponse>(`/payments/${paymentId}/pixQrCode`);
}

export function isAsaasPixEnabled() {
  return Boolean(getAsaasApiKey());
}

export function getAsaasWebhookToken() {
  return process.env.ASAAS_WEBHOOK_TOKEN?.trim() ?? "";
}

export type AsaasWebhookEvent = {
  event?: string;
  payment?: {
    id?: string;
    status?: string;
    externalReference?: string | null;
  };
};

export async function createDynamicPixPayment(input: {
  orderId: string;
  customerName: string;
  customerPhone: string;
  customerCpfCnpj: string;
  totalPrice: number;
  dueDate?: string | null;
}) {
  const customer = await createAsaasCustomer({
    name: input.customerName,
    phone: input.customerPhone,
    cpfCnpj: input.customerCpfCnpj,
  });

  const payment = await createAsaasPixCharge({
    customerId: customer.id,
    orderId: input.orderId,
    totalPrice: input.totalPrice,
    dueDate: input.dueDate,
  });

  const qrCode = await getAsaasPixQrCode(payment.id);

  if (!qrCode.payload) {
    throw new Error("Asaas did not return a Pix copy and paste payload.");
  }

  return {
    provider: "ASAAS",
    kind: "DYNAMIC_PIX",
    externalId: payment.id,
    pixCopyAndPaste: qrCode.payload,
    qrCodeImage: qrCode.encodedImage
      ? `data:image/png;base64,${qrCode.encodedImage}`
      : null,
    expiresAt: qrCode.expirationDate ?? null,
  } satisfies AsaasDynamicPixPayment;
}
