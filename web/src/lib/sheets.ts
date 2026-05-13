import { google } from "googleapis";
import { randomUUID } from "node:crypto";
import type {
  AccountingSummary,
  AppRecord,
  CreateRecordPayload,
  DeletedRecord,
  PartnerExpense,
  PartnerSummary,
  MarkReceivableCollectedPayload,
  RowActionPayload,
  TransactionRecord,
  UpdateReceivablePayload,
  WorkRecord,
} from "./accounting";
import { parseAmount } from "./accounting";

const DEFAULT_SPREADSHEET_ID = "15kaSfdKd-L1pAQInHCZt9i2Ub-PjrZJFJw1hjusmhiw";
const SPREADSHEET_TITLE = "Durukan Klima Gelir Gider Takibi";
const SHEETS = {
  transactions: "Sheet1",
  jobs: "Kaplan Teknik",
  receivables: "Tahsilat Takibi",
  appRecords: "App Kayıtları",
  deletedRecords: "Silinen Kayıtlar",
};

function cleanEnv(value: string | undefined): string {
  return String(value ?? "").replace(/^\uFEFF/, "").trim();
}

const sampleSummary: AccountingSummary = {
  spreadsheetId: DEFAULT_SPREADSHEET_ID,
  spreadsheetTitle: SPREADSHEET_TITLE,
  configured: false,
  totals: {
    jobs: 17200,
    receivables: 17200,
    collected: 0,
    income: 5000,
    expenses: 750,
    net: 4250,
  },
  jobs: [
    { customer: "Kültür Daire Başkanlığı", job: "Servis", amount: 1000 },
    { customer: "Aykome Alt Yapı Koordinasyon", job: "İç ünite kart arızası", amount: 2600 },
    { customer: "Park Bahçe", job: "Klima kart arızası", amount: 3500 },
    { customer: "Kadir Abi", job: "12 BTU klima montajı", amount: 3600, date: "09.05.2026" },
    { customer: "Ali Abi", job: "24 BTU klima montajı", amount: 6500, date: "10.05.2026" },
  ],
  receivables: [
    { customer: "Kültür Daire Başkanlığı", job: "Servis", amount: 1000, status: "Tahsil Edilmedi" },
    { customer: "Aykome Alt Yapı Koordinasyon", job: "İç ünite kart arızası", amount: 2600, status: "Tahsil Edilmedi" },
    { customer: "Park Bahçe", job: "Klima kart arızası", amount: 3500, status: "Tahsil Edilmedi" },
    { customer: "Kadir Abi", job: "12 BTU klima montajı", amount: 3600, status: "Tahsil Edilmedi" },
    { customer: "Ali Abi", job: "24 BTU klima montajı", amount: 6500, status: "Tahsil Edilmedi" },
  ],
  transactions: [
    {
      date: "11.05.2026",
      type: "Gelir",
      category: "Klima Montajı",
      description: "Örnek kayıt",
      amount: 5000,
      paymentType: "Nakit",
    },
    {
      date: "11.05.2026",
      type: "Gider",
      category: "Yakıt",
      description: "Servis aracı",
      amount: 750,
      paymentType: "Kart",
    },
  ],
  appRecords: [],
  deletedRecords: [],
  partner: {
    youPaid: 0,
    partnerPaid: 0,
    partnerOwesYou: 0,
    youOwePartner: 0,
    net: 0,
    openItems: [],
  },
  generatedAt: new Date().toISOString(),
};

export function hasGoogleCredentials(): boolean {
  return Boolean(cleanEnv(process.env.GOOGLE_CLIENT_EMAIL) && cleanEnv(process.env.GOOGLE_PRIVATE_KEY));
}

function getPrivateKey(): string {
  return cleanEnv(process.env.GOOGLE_PRIVATE_KEY).replace(/\\n/g, "\n");
}

async function getSheetsClient() {
  const auth = new google.auth.JWT({
    email: cleanEnv(process.env.GOOGLE_CLIENT_EMAIL),
    key: getPrivateKey(),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  return google.sheets({ version: "v4", auth });
}

function rowsFromRange(values: string[][] | undefined): string[][] {
  return values?.filter((row) => row.some((cell) => String(cell ?? "").trim())) ?? [];
}

function mapJobs(rows: string[][]): WorkRecord[] {
  return rows.slice(1).map((row) => ({
    customer: row[0] ?? "",
    job: row[1] ?? "",
    amount: parseAmount(row[2]),
    date: row[3],
  }));
}

function mapReceivables(rows: string[][]): WorkRecord[] {
  return rows
    .slice(1)
    .map((row, index) => ({
      rowNumber: index + 2,
      customer: row[0] ?? "",
      job: row[1] ?? "",
      amount: parseAmount(row[2]),
      status: row[3] ?? "",
    }))
    .filter((row) => row.customer || row.job || row.amount || row.status);
}

function mapTransactions(rows: string[][]): TransactionRecord[] {
  return rows
    .slice(1)
    .map((row, index) => {
      const shifted = !row[0] && !row[1] && !row[2] && Boolean(row[3] || row[4] || row[5]);
      const offset = shifted ? 3 : 0;

      return {
        rowNumber: index + 2,
        date: row[offset] ?? "",
        type: row[offset + 1] ?? "",
        category: row[offset + 2] ?? "",
        description: row[offset + 3] ?? "",
        amount: parseAmount(row[offset + 4]),
        paymentType: row[offset + 5] ?? "",
      };
    })
    .filter((row) => row.date || row.type || row.category || row.description || row.amount || row.paymentType);
}

function mapAppRecords(rows: string[][]): AppRecord[] {
  return rows.slice(1).map((row) => ({
    id: row[0] ?? "",
    date: row[1] ?? "",
    customer: row[2] ?? "",
    phone: row[3] ?? "",
    jobType: row[4] ?? "",
    description: row[5] ?? "",
    amount: parseAmount(row[6]),
    paymentStatus: row[7] ?? "",
    paymentType: row[8] ?? "",
    note: row[9] ?? "",
    employee: row[10] ?? "",
  }));
}

function mapDeletedRecords(rows: string[][]): DeletedRecord[] {
  return rows.slice(1).map((row) => ({
    deletedAt: row[0] ?? "",
    source: row[1] ?? "",
    rowNumber: parseAmount(row[2]),
    recordType: row[3] ?? "",
    customer: row[4] ?? "",
    description: row[5] ?? "",
    amount: parseAmount(row[6]),
    paymentType: row[7] ?? "",
  }));
}

function parsePartnerExpense(record: TransactionRecord): PartnerExpense | null {
  if (record.type !== "Gider" || !record.description.includes("[ORTAK:")) {
    return null;
  }

  const payerMatch = record.description.match(/\[ORTAK:([^|\]]+)/);
  const statusMatch = record.description.match(/\|DURUM:([^|\]]+)/);
  const rawPayer = payerMatch?.[1]?.trim();
  const payer = rawPayer === "Şirin" || rawPayer === "Ortağım" ? "Şirin" : "Durukan";
  const status = statusMatch?.[1]?.trim() === "Kapandı" ? "Kapandı" : "Açık";
  const description = record.description.replace(/\s*\[ORTAK:[^\]]+\]\s*/g, "").trim();

  return {
    rowNumber: record.rowNumber,
    date: record.date,
    description,
    amount: record.amount,
    payer,
    share: record.amount / 2,
    status,
  };
}

function summarizePartner(transactions: TransactionRecord[]): PartnerSummary {
  const openItems = transactions
    .map(parsePartnerExpense)
    .filter((item): item is PartnerExpense => Boolean(item))
    .filter((item) => item.status === "Açık");
  const youPaid = openItems.filter((item) => item.payer === "Durukan").reduce((sum, item) => sum + item.share, 0);
  const partnerPaid = openItems.filter((item) => item.payer === "Şirin").reduce((sum, item) => sum + item.share, 0);
  const net = youPaid - partnerPaid;

  return {
    youPaid,
    partnerPaid,
    partnerOwesYou: Math.max(net, 0),
    youOwePartner: Math.max(-net, 0),
    net,
    openItems,
  };
}

function todayTr(): string {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Istanbul",
  }).format(new Date());
}

function nowTr(): string {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Istanbul",
  }).format(new Date());
}

async function ensureDeletedSheet(
  sheets: Awaited<ReturnType<typeof getSheetsClient>>,
  spreadsheetId: string,
): Promise<void> {
  const metadata = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = metadata.data.sheets?.some((sheet) => sheet.properties?.title === SHEETS.deletedRecords);

  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title: SHEETS.deletedRecords,
              },
            },
          },
        ],
      },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${SHEETS.deletedRecords}'!A1:H1`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [["Silinme Tarihi", "Kaynak", "Satır", "Tür", "Müşteri", "Açıklama", "Tutar", "Ödeme Türü"]],
      },
    });
  }
}

async function logDeletedRecord(
  sheets: Awaited<ReturnType<typeof getSheetsClient>>,
  spreadsheetId: string,
  values: (string | number)[],
): Promise<void> {
  await ensureDeletedSheet(sheets, spreadsheetId);
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `'${SHEETS.deletedRecords}'!A:H`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [values],
    },
  });
}

async function appendTransactionRow(
  sheets: Awaited<ReturnType<typeof getSheetsClient>>,
  spreadsheetId: string,
  row: (string | number)[],
): Promise<void> {
  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEETS.transactions}!A:I`,
  });
  const nextRow = (existing.data.values?.length ?? 0) + 1;

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${SHEETS.transactions}!A${nextRow}:F${nextRow}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [row],
    },
  });
}

function normalizePayload(payload: CreateRecordPayload): Required<CreateRecordPayload> {
  const amount = Number(payload.amount);

  if (!payload.recordType) {
    throw new Error("Kayıt türü zorunlu.");
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Tutar sıfırdan büyük olmalı.");
  }

  return {
    recordType: payload.recordType,
    customer: payload.customer?.trim() || "Genel",
    phone: payload.phone?.trim() || "",
    jobType: payload.jobType?.trim() || (payload.recordType === "expense" ? "Gider" : "İş"),
    description: payload.description?.trim() || "",
    amount,
    paymentStatus: payload.paymentStatus ?? (payload.recordType === "expense" ? "Tahsil Edildi" : "Tahsil Edilmedi"),
    paymentType: payload.paymentType?.trim() || "Belirtilmedi",
    note: payload.note?.trim() || "",
    employee: payload.employee?.trim() || "Saha",
  };
}

export async function getAccountingSummary(): Promise<AccountingSummary> {
  const spreadsheetId = cleanEnv(process.env.GOOGLE_SHEET_ID) || DEFAULT_SPREADSHEET_ID;

  if (!hasGoogleCredentials()) {
    return { ...sampleSummary, spreadsheetId, generatedAt: new Date().toISOString() };
  }

  const sheets = await getSheetsClient();
  await ensureDeletedSheet(sheets, spreadsheetId);
  const response = await sheets.spreadsheets.values.batchGet({
    spreadsheetId,
    ranges: [
      "'Kaplan Teknik'!A1:D500",
      "'Tahsilat Takibi'!A1:D500",
      "Sheet1!A1:I500",
      "'App Kayıtları'!A1:K500",
      "'Silinen Kayıtlar'!A1:H500",
    ],
  });

  const [jobsRange, receivablesRange, transactionsRange, appRecordsRange, deletedRecordsRange] =
    response.data.valueRanges ?? [];
  const jobs = mapJobs(rowsFromRange(jobsRange?.values as string[][] | undefined));
  const receivables = mapReceivables((receivablesRange?.values as string[][] | undefined) ?? []);
  const transactions = mapTransactions(rowsFromRange(transactionsRange?.values as string[][] | undefined));
  const appRecords = mapAppRecords(rowsFromRange(appRecordsRange?.values as string[][] | undefined));
  const deletedRecords = mapDeletedRecords(rowsFromRange(deletedRecordsRange?.values as string[][] | undefined));
  const partner = summarizePartner(transactions);

  const income = transactions
    .filter((record) => record.type.toLocaleLowerCase("tr-TR") === "gelir")
    .reduce((sum, record) => sum + record.amount, 0);
  const expenses = transactions
    .filter((record) => record.type.toLocaleLowerCase("tr-TR") === "gider")
    .reduce((sum, record) => sum + record.amount, 0);
  const collected = receivables
    .filter((record) => record.status?.toLocaleLowerCase("tr-TR") === "tahsil edildi")
    .reduce((sum, record) => sum + record.amount, 0);

  return {
    spreadsheetId,
    spreadsheetTitle: SPREADSHEET_TITLE,
    configured: true,
    totals: {
      jobs: jobs.reduce((sum, record) => sum + record.amount, 0),
      receivables: receivables
        .filter((record) => record.status?.toLocaleLowerCase("tr-TR") !== "tahsil edildi")
        .reduce((sum, record) => sum + record.amount, 0),
      collected,
      income,
      expenses,
      net: collected - expenses,
    },
    jobs,
    receivables,
    transactions,
    appRecords,
    deletedRecords,
    partner,
    generatedAt: new Date().toISOString(),
  };
}

export async function markReceivableCollected(payload: MarkReceivableCollectedPayload): Promise<WorkRecord> {
  if (!hasGoogleCredentials()) {
    throw new Error("Google Sheets düzenleme işlemi için servis hesabı bilgileri gerekli.");
  }

  const rowNumber = Number(payload.rowNumber);

  if (!Number.isInteger(rowNumber) || rowNumber < 2) {
    throw new Error("Geçerli bir tahsilat satırı seçilmedi.");
  }

  const spreadsheetId = cleanEnv(process.env.GOOGLE_SHEET_ID) || DEFAULT_SPREADSHEET_ID;
  const sheets = await getSheetsClient();
  const rowRange = `'${SHEETS.receivables}'!A${rowNumber}:D${rowNumber}`;
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: rowRange,
  });
  const row = response.data.values?.[0] ?? [];
  const record: WorkRecord = {
    rowNumber,
    customer: row[0] ?? "",
    job: row[1] ?? "",
    amount: parseAmount(row[2]),
    status: row[3] ?? "",
  };

  if (!record.customer || !record.job || record.amount <= 0) {
    throw new Error("Seçilen tahsilat satırı geçerli bir kayıt değil.");
  }

  if (record.status?.toLocaleLowerCase("tr-TR") === "tahsil edildi") {
    throw new Error("Bu kayıt zaten tahsil edildi görünüyor.");
  }

  const date = todayTr();
  const paymentType = payload.paymentType?.trim() || "Nakit";

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${SHEETS.receivables}'!D${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [["Tahsil Edildi"]],
    },
  });

  await appendTransactionRow(sheets, spreadsheetId, [
    date,
    "Gelir",
    "Tahsilat",
    `${record.customer} - ${record.job}`,
    record.amount,
    paymentType,
  ]);

  return { ...record, status: "Tahsil Edildi" };
}

export async function markReceivableUncollected(payload: RowActionPayload): Promise<WorkRecord> {
  if (!hasGoogleCredentials()) {
    throw new Error("Google Sheets düzenleme işlemi için servis hesabı bilgileri gerekli.");
  }

  const rowNumber = Number(payload.rowNumber);

  if (!Number.isInteger(rowNumber) || rowNumber < 2) {
    throw new Error("Geçerli bir tahsilat satırı seçilmedi.");
  }

  const spreadsheetId = cleanEnv(process.env.GOOGLE_SHEET_ID) || DEFAULT_SPREADSHEET_ID;
  const sheets = await getSheetsClient();
  const rowRange = `'${SHEETS.receivables}'!A${rowNumber}:D${rowNumber}`;
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: rowRange,
  });
  const row = response.data.values?.[0] ?? [];
  const record: WorkRecord = {
    rowNumber,
    customer: row[0] ?? "",
    job: row[1] ?? "",
    amount: parseAmount(row[2]),
    status: row[3] ?? "",
  };

  if (!record.customer || !record.job || record.amount <= 0) {
    throw new Error("Seçilen tahsilat satırı geçerli bir kayıt değil.");
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${SHEETS.receivables}'!D${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [["Tahsil Edilmedi"]],
    },
  });

  return { ...record, status: "Tahsil Edilmedi" };
}

export async function updateReceivable(payload: UpdateReceivablePayload): Promise<WorkRecord> {
  if (!hasGoogleCredentials()) {
    throw new Error("Google Sheets düzenleme işlemi için servis hesabı bilgileri gerekli.");
  }

  const rowNumber = Number(payload.rowNumber);
  const amount = Number(payload.amount);
  const customer = payload.customer?.trim() ?? "";
  const job = payload.job?.trim() ?? "";
  const status = payload.status?.trim() || "Tahsil Edilmedi";

  if (!Number.isInteger(rowNumber) || rowNumber < 2) {
    throw new Error("Geçerli bir tahsilat satırı seçilmedi.");
  }

  if (!customer || !job) {
    throw new Error("Müşteri ve iş açıklaması zorunlu.");
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Tutar sıfırdan büyük olmalı.");
  }

  if (status !== "Tahsil Edildi" && status !== "Tahsil Edilmedi") {
    throw new Error("Geçersiz tahsilat durumu.");
  }

  const spreadsheetId = cleanEnv(process.env.GOOGLE_SHEET_ID) || DEFAULT_SPREADSHEET_ID;
  const sheets = await getSheetsClient();

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${SHEETS.receivables}'!A${rowNumber}:D${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[customer, job, amount, status]],
    },
  });

  return { rowNumber, customer, job, amount, status };
}

export async function createAccountingRecord(payload: CreateRecordPayload): Promise<AppRecord> {
  if (!hasGoogleCredentials()) {
    throw new Error("Google Sheets yazma işlemi için servis hesabı bilgileri gerekli.");
  }

  const spreadsheetId = cleanEnv(process.env.GOOGLE_SHEET_ID) || DEFAULT_SPREADSHEET_ID;
  const sheets = await getSheetsClient();
  const record = normalizePayload(payload);
  const id = randomUUID();
  const date = todayTr();

  const appRecord: AppRecord = {
    id,
    date,
    customer: record.customer,
    phone: record.phone,
    jobType: record.jobType,
    description: record.description,
    amount: record.amount,
    paymentStatus: record.paymentStatus,
    paymentType: record.paymentType,
    note: record.note,
    employee: record.employee,
  };

  const appendRows = [
    {
      range: `'${SHEETS.appRecords}'!A:K`,
      values: [
        [
          appRecord.id,
          appRecord.date,
          appRecord.customer,
          appRecord.phone,
          appRecord.jobType,
          appRecord.description,
          appRecord.amount,
          appRecord.paymentStatus,
          appRecord.paymentType,
          appRecord.note,
          appRecord.employee,
        ],
      ],
    },
  ];

  if (record.recordType === "job") {
    appendRows.push(
      {
        range: `'${SHEETS.jobs}'!A:D`,
        values: [[record.customer, record.jobType || record.description, record.amount, date]],
      },
      {
        range: `'${SHEETS.receivables}'!A:D`,
        values: [[record.customer, record.jobType || record.description, record.amount, record.paymentStatus]],
      },
    );

    if (record.paymentStatus === "Tahsil Edildi") {
      await appendTransactionRow(sheets, spreadsheetId, [
        date,
        "Gelir",
        record.jobType,
        record.description || record.customer,
        record.amount,
        record.paymentType,
      ]);
    }
  }

  if (record.recordType === "payment") {
    await appendTransactionRow(sheets, spreadsheetId, [
      date,
      "Gelir",
      "Tahsilat",
      record.description || record.customer,
      record.amount,
      record.paymentType,
    ]);
  }

  if (record.recordType === "expense") {
    const description = [record.description || record.customer, record.note].filter(Boolean).join(" ");
    await appendTransactionRow(sheets, spreadsheetId, [
      date,
      "Gider",
      record.jobType,
      description,
      record.amount,
      record.paymentType,
    ]);
  }

  await Promise.all(
    appendRows.map((row) =>
      sheets.spreadsheets.values.append({
        spreadsheetId,
        range: row.range,
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        requestBody: {
          values: row.values,
        },
      }),
    ),
  );

  return appRecord;
}

export async function deleteAppRecord(id: string): Promise<void> {
  if (!hasGoogleCredentials()) {
    throw new Error("Google Sheets silme işlemi için servis hesabı bilgileri gerekli.");
  }

  const spreadsheetId = cleanEnv(process.env.GOOGLE_SHEET_ID) || DEFAULT_SPREADSHEET_ID;
  const sheets = await getSheetsClient();
  const metadata = await sheets.spreadsheets.get({ spreadsheetId });
  const appSheet = metadata.data.sheets?.find((sheet) => sheet.properties?.title === SHEETS.appRecords);
  const sheetId = appSheet?.properties?.sheetId;

  if (sheetId === undefined) {
    throw new Error("App Kayıtları sekmesi bulunamadı.");
  }

  const rows = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${SHEETS.appRecords}'!A:K`,
  });
  const rowIndex = rows.data.values?.findIndex((row) => row[0] === id) ?? -1;

  if (rowIndex <= 0) {
    throw new Error("Silinecek kayıt bulunamadı.");
  }

  const row = rows.data.values?.[rowIndex] ?? [];
  await logDeletedRecord(sheets, spreadsheetId, [
    nowTr(),
    SHEETS.appRecords,
    rowIndex + 1,
    row[4] ?? "Uygulama Kaydı",
    row[2] ?? "",
    row[5] ?? "",
    parseAmount(row[6]),
    row[8] ?? "",
  ]);

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId,
              dimension: "ROWS",
              startIndex: rowIndex,
              endIndex: rowIndex + 1,
            },
          },
        },
      ],
    },
  });
}

export async function deleteTransactionRow(payload: RowActionPayload): Promise<void> {
  if (!hasGoogleCredentials()) {
    throw new Error("Google Sheets silme işlemi için servis hesabı bilgileri gerekli.");
  }

  const rowNumber = Number(payload.rowNumber);

  if (!Number.isInteger(rowNumber) || rowNumber < 2) {
    throw new Error("Silinecek hareket satırı seçilmedi.");
  }

  const spreadsheetId = cleanEnv(process.env.GOOGLE_SHEET_ID) || DEFAULT_SPREADSHEET_ID;
  const sheets = await getSheetsClient();
  const rowValues = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEETS.transactions}!A${rowNumber}:F${rowNumber}`,
  });
  const row = rowValues.data.values?.[0] ?? [];

  if (!row.some((cell) => String(cell ?? "").trim())) {
    throw new Error("Silinecek hareket satırı bulunamadı.");
  }

  const metadata = await sheets.spreadsheets.get({ spreadsheetId });
  const transactionSheet = metadata.data.sheets?.find((sheet) => sheet.properties?.title === SHEETS.transactions);
  const sheetId = transactionSheet?.properties?.sheetId;

  if (sheetId === undefined) {
    throw new Error("Gelir gider sekmesi bulunamadı.");
  }

  await logDeletedRecord(sheets, spreadsheetId, [
    nowTr(),
    SHEETS.transactions,
    rowNumber,
    row[1] ?? "",
    "",
    row[3] || row[2] || "",
    parseAmount(row[4]),
    row[5] ?? "",
  ]);

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId,
              dimension: "ROWS",
              startIndex: rowNumber - 1,
              endIndex: rowNumber,
            },
          },
        },
      ],
    },
  });
}

export async function deleteReceivableRow(payload: RowActionPayload): Promise<void> {
  if (!hasGoogleCredentials()) {
    throw new Error("Google Sheets silme işlemi için servis hesabı bilgileri gerekli.");
  }

  const rowNumber = Number(payload.rowNumber);

  if (!Number.isInteger(rowNumber) || rowNumber < 2) {
    throw new Error("Silinecek tahsilat satırı seçilmedi.");
  }

  const spreadsheetId = cleanEnv(process.env.GOOGLE_SHEET_ID) || DEFAULT_SPREADSHEET_ID;
  const sheets = await getSheetsClient();
  const rowValues = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${SHEETS.receivables}'!A${rowNumber}:D${rowNumber}`,
  });
  const row = rowValues.data.values?.[0] ?? [];

  if (!row.some((cell) => String(cell ?? "").trim())) {
    throw new Error("Silinecek tahsilat satırı bulunamadı.");
  }

  const metadata = await sheets.spreadsheets.get({ spreadsheetId });
  const receivableSheet = metadata.data.sheets?.find((sheet) => sheet.properties?.title === SHEETS.receivables);
  const sheetId = receivableSheet?.properties?.sheetId;

  if (sheetId === undefined) {
    throw new Error("Tahsilat sekmesi bulunamadı.");
  }

  await logDeletedRecord(sheets, spreadsheetId, [
    nowTr(),
    SHEETS.receivables,
    rowNumber,
    row[3] ?? "Tahsilat",
    row[0] ?? "",
    row[1] ?? "",
    parseAmount(row[2]),
    "",
  ]);

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId,
              dimension: "ROWS",
              startIndex: rowNumber - 1,
              endIndex: rowNumber,
            },
          },
        },
      ],
    },
  });
}
