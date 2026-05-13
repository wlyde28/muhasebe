import { NextResponse } from "next/server";
import {
  createAccountingRecord,
  deleteAppRecord,
  deleteReceivableRow,
  deleteTransactionRow,
  getAccountingSummary,
  markReceivableCollected,
  markReceivableUncollected,
  updateReceivable,
} from "@/lib/sheets";

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
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    const type = url.searchParams.get("type");
    const rowNumber = url.searchParams.get("rowNumber");

    if (type === "transaction") {
      await deleteTransactionRow({ rowNumber: Number(rowNumber) });
      return NextResponse.json({ ok: true });
    }

    if (type === "receivable") {
      await deleteReceivableRow({ rowNumber: Number(rowNumber) });
      return NextResponse.json({ ok: true });
    }

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

    if (body.action === "mark_receivable_collected") {
      const record = await markReceivableCollected(body);
      return NextResponse.json({ record });
    }

    if (body.action === "mark_receivable_uncollected") {
      const record = await markReceivableUncollected(body);
      return NextResponse.json({ record });
    }

    if (body.action === "update_receivable") {
      const record = await updateReceivable(body);
      return NextResponse.json({ record });
    }

    return NextResponse.json({ error: "Bilinmeyen işlem." }, { status: 400 });
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
