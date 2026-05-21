import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const dynamic = "force-dynamic";

type AppSettingRecord = { key: string; value: string };

export async function GET() {
  try {
    const settings = (await prisma.appSetting.findMany()) as AppSettingRecord[];

    const result: Record<string, string> = {};
    for (const setting of settings) {
      result[setting.key] = setting.value;
    }

    return Response.json(result);
  } catch (error) {
    console.error("Erro ao buscar configuracoes:", error);

    return Response.json(
      { error: "Nao foi possivel buscar as configuracoes." },
      { status: 500 },
    );
  }
}

const patchSettingSchema = z.object({
  key: z.string().trim().min(1, "Chave e obrigatoria."),
  value: z.string().trim().min(1, "Valor e obrigatorio."),
});

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const parsed = patchSettingSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: "Dados invalidos.", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { key, value } = parsed.data;

    const setting = (await prisma.appSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    })) as AppSettingRecord;

    return Response.json({ key: setting.key, value: setting.value });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json({ error: "JSON invalido." }, { status: 400 });
    }

    console.error("Erro ao atualizar configuracao:", error);

    return Response.json(
      { error: "Nao foi possivel atualizar a configuracao." },
      { status: 500 },
    );
  }
}
