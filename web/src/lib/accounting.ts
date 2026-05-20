export type WorkRecord = {
  rowNumber?: number;
  customer: string;
  job: string;
  amount: number;
  date?: string;
  status?: string;
};

export type TransactionRecord = {
  rowNumber?: number;
  date: string;
  type: string;
  category: string;
  description: string;
  amount: number;
  paymentType: string;
};

export type AccountingSummary = {
  spreadsheetId: string;
  spreadsheetTitle: string;
  configured: boolean;
  totals: {
    jobs: number;
    receivables: number;
    collected: number;
    income: number;
    expenses: number;
    net: number;
  };
  jobs: WorkRecord[];
  receivables: WorkRecord[];
  transactions: TransactionRecord[];
  appRecords: AppRecord[];
  deletedRecords: DeletedRecord[];
  partner: PartnerSummary;
  generatedAt: string;
};

export type AppRecord = {
  id: string;
  date: string;
  customer: string;
  phone: string;
  jobType: string;
  description: string;
  amount: number;
  paymentStatus: string;
  paymentType: string;
  note: string;
  employee: string;
};

export type DeletedRecord = {
  deletedAt: string;
  source: string;
  rowNumber: number;
  originalRowNumber?: number;
  recordType: string;
  customer: string;
  description: string;
  amount: number;
  paymentType: string;
};

export type PartnerSummary = {
  youPaid: number;
  partnerPaid: number;
  partnerOwesYou: number;
  youOwePartner: number;
  net: number;
  openItems: PartnerExpense[];
  closedItems: PartnerExpense[];
};

export type PartnerExpense = {
  rowNumber?: number;
  date: string;
  description: string;
  amount: number;
  payer: "Durukan" | "Şirin";
  share: number;
  status: "Açık" | "Kapandı";
};

export type CreateRecordPayload = {
  recordType: "job" | "expense" | "payment" | "settlement";
  customer?: string;
  phone?: string;
  jobType?: string;
  description?: string;
  amount?: number;
  paymentStatus?: "Tahsil Edildi" | "Tahsil Edilmedi";
  paymentType?: string;
  note?: string;
  employee?: string;
  date?: string;
};

export type MarkReceivableCollectedPayload = {
  rowNumber?: number;
  paymentType?: string;
  employee?: string;
};

export type RowActionPayload = {
  rowNumber?: number;
  date?: string;
  type?: string;
  category?: string;
  description?: string;
  amount?: number;
  paymentType?: string;
};

export type UpdateReceivablePayload = {
  rowNumber?: number;
  customer?: string;
  job?: string;
  amount?: number;
  status?: "Tahsil Edildi" | "Tahsil Edilmedi";
};

export type RestoreDeletedPayload = {
  deletedRowNumber?: number;
};

export function parseAmount(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }

  const normalized = String(value ?? "")
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");

  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

export function toCurrency(amount: number): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(amount);
}
