import { google } from "googleapis";
import { randomUUID } from "node:crypto";
import type { AccountingSummary, AppRecord, CreateRecordPayload, TransactionRecord, WorkRecord } from "./accounting";
import { parseAmount } from "./accounting";

const DEFAULT_SPREADSHEET_ID = "15kaSfdKd-L1pAQInHCZt9i2Ub-PjrZJFJw1hjusmhiw";
const SPREADSHEET_TITLE = "Durukan Klima Gelir Gider Takibi";
const SHEETS = {
  transactions: "Sheet1",
  jobs: "Kaplan Teknik",
  receivables: "Tahsilat Takibi",
  appRecords: "App Kayıtları",
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
  return rows.slice(1).map((row) => ({
    customer: row[0] ?? "",
    job: row[1] ?? "",
    amount: parseAmount(row[2]),
    status: row[3] ?? "",
  }));
}

function mapTransactions(rows: string[][]): TransactionRecord[] {
  return rows.slice(1).map((row) => ({
    date: row[0] ?? "",
    type: row[1] ?? "",
    category: row[2] ?? "",
    description: row[3] ?? "",
    amount: parseAmount(row[4]),
    paymentType: row[5] ?? "",
  }));
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

function todayTr(): string {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Istanbul",
  }).format(new Date());
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
  const response = await sheets.spreadsheets.values.batchGet({
    spreadsheetId,
    ranges: ["'Kaplan Teknik'!A1:D500", "'Tahsilat Takibi'!A1:D500", "Sheet1!A1:F500", "'App Kayıtları'!A1:K500"],
  });

  const [jobsRange, receivablesRange, transactionsRange, appRecordsRange] = response.data.valueRanges ?? [];
  const jobs = mapJobs(rowsFromRange(jobsRange?.values as string[][] | undefined));
  const receivables = mapReceivables(rowsFromRange(receivablesRange?.values as string[][] | undefined));
  const transactions = mapTransactions(rowsFromRange(transactionsRange?.values as string[][] | undefined));
  const appRecords = mapAppRecords(rowsFromRange(appRecordsRange?.values as string[][] | undefined));

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
      net: income - expenses,
    },
    jobs,
    receivables,
    transactions,
    appRecords,
    generatedAt: new Date().toISOString(),
  };
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
      appendRows.push({
        range: `${SHEETS.transactions}!A:F`,
        values: [[date, "Gelir", record.jobType, record.description || record.customer, record.amount, record.paymentType]],
      });
    }
  }

  if (record.recordType === "payment") {
    appendRows.push({
      range: `${SHEETS.transactions}!A:F`,
      values: [[date, "Gelir", "Tahsilat", record.description || record.customer, record.amount, record.paymentType]],
    });
  }

  if (record.recordType === "expense") {
    appendRows.push({
      range: `${SHEETS.transactions}!A:F`,
      values: [[date, "Gider", record.jobType, record.description || record.customer, record.amount, record.paymentType]],
    });
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
    range: `'${SHEETS.appRecords}'!A:A`,
  });
  const rowIndex = rows.data.values?.findIndex((row) => row[0] === id) ?? -1;

  if (rowIndex <= 0) {
    throw new Error("Silinecek kayıt bulunamadı.");
  }

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
