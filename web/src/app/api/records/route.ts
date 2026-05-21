import { NextResponse } from "next/server";
import {
  closePartnerExpense,
  createAccountingRecord,
  deleteAppRecord,
  deleteReceivableRow,
  deleteTransactionRow,
  createUserPin,
  getAccountingSummary,
  getUserPinStatus,
  markReceivableCollected,
  markReceivableUncollected,
  restoreDeletedRecord,
  updateReceivable,
  verifyUserPin,
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
      await deleteTransactionRow({
        rowNumber: Number(rowNumber),
        date: url.searchParams.get("date") ?? undefined,
        type: url.searchParams.get("recordType") ?? undefined,
        category: url.searchParams.get("category") ?? undefined,
        description: url.searchParams.get("description") ?? undefined,
        amount: url.searchParams.has("amount") ? Number(url.searchParams.get("amount")) : undefined,
        paymentType: url.searchParams.get("paymentType") ?? undefined,
      });
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

    if (body.action === "get_user_pin_status") {
      const auth = await getUserPinStatus(body);
      return NextResponse.json({ auth });
    }

    if (body.action === "create_user_pin") {
      const auth = await createUserPin(body);
      return NextResponse.json({ auth }, { status: 201 });
    }

    if (body.action === "verify_user_pin") {
      const auth = await verifyUserPin(body);
      return NextResponse.json({ auth });
    }

    if (body.action === "mark_receivable_uncollected") {
      const record = await markReceivableUncollected(body);
      return NextResponse.json({ record });
    }

    if (body.action === "update_receivable") {
      const record = await updateReceivable(body);
      return NextResponse.json({ record });
    }

    if (body.action === "close_partner_expense") {
      const record = await closePartnerExpense(body);
      return NextResponse.json({ record });
    }

    if (body.action === "restore_deleted") {
      await restoreDeletedRecord(body);
      return NextResponse.json({ ok: true });
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
