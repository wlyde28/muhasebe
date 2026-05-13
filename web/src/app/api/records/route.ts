import { NextResponse } from "next/server";
import { createAccountingRecord, deleteAppRecord, getAccountingSummary, markReceivableCollected } from "@/lib/sheets";

function checkPin(request: Request): NextResponse | null {
  const expectedPin = String(process.env.APP_SHARED_PIN ?? "").replace(/^\uFEFF/, "").trim();

  if (!expectedPin) {
    return null;
  }

  if (request.headers.get("x-app-pin") === expectedPin) {
    return null;
  }

  return NextResponse.json({ error: "PIN hatalı." }, { status: 401 });
}

export async function GET() {
  try {
    const summary = await getAccountingSummary();
    return NextResponse.json(summary);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Google Sheet verisi okunamadı.",
        detail: error instanceof Error ? error.message : "Bilinmeyen hata",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const pinError = checkPin(request);

  if (pinError) {
    return pinError;
  }

  try {
    const record = await createAccountingRecord(await request.json());
    return NextResponse.json({ record }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Kayıt eklenemedi.",
        detail: error instanceof Error ? error.message : "Bilinmeyen hata",
      },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  const pinError = checkPin(request);

  if (pinError) {
    return pinError;
  }

  try {
    const id = new URL(request.url).searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Kayıt ID gerekli." }, { status: 400 });
    }

    await deleteAppRecord(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Kayıt silinemedi.",
        detail: error instanceof Error ? error.message : "Bilinmeyen hata",
      },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request) {
  const pinError = checkPin(request);

  if (pinError) {
    return pinError;
  }

  try {
    const body = await request.json();

    if (body.action !== "mark_receivable_collected") {
      return NextResponse.json({ error: "Bilinmeyen işlem." }, { status: 400 });
    }

    const record = await markReceivableCollected(body);
    return NextResponse.json({ record });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Tahsilat güncellenemedi.",
        detail: error instanceof Error ? error.message : "Bilinmeyen hata",
      },
      { status: 400 },
    );
  }
}
