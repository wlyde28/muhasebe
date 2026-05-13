import { getAccountingSummary } from "@/lib/sheets";
import { toCurrency } from "@/lib/accounting";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export default async function Home() {
  const summary = await getAccountingSummary().catch((error) => ({
    spreadsheetId: "15kaSfdKd-L1pAQInHCZt9i2Ub-PjrZJFJw1hjusmhiw",
    spreadsheetTitle: "Durukan Klima Gelir Gider Takibi",
    configured: false,
    totals: {
      jobs: 0,
      receivables: 0,
      collected: 0,
      income: 0,
      expenses: 0,
      net: 0,
    },
    jobs: [],
    receivables: [],
    transactions: [],
    appRecords: [],
    generatedAt: new Date().toISOString(),
    error: error instanceof Error ? error.message : "Google Sheet verisi okunamadı.",
  }));
  const recentJobs = summary.jobs.slice(-5).reverse();
  const openReceivables = summary.receivables
    .filter((record) => record.status !== "Tahsil Edildi")
    .slice(0, 8);

  return (
    <main className={styles.page}>
      <section className={styles.header}>
        <div>
          <p className={styles.kicker}>Durukan Klima</p>
          <h1>Gelir gider ve tahsilat paneli</h1>
          <p className={styles.subtitle}>
            Veriler Google Sheets dosyasından okunur. Mobil uygulama da aynı API katmanını kullanır.
          </p>
        </div>
        <a
          className={styles.sheetLink}
          href={`https://docs.google.com/spreadsheets/d/${summary.spreadsheetId}/edit`}
          target="_blank"
          rel="noreferrer"
        >
          Google Sheet
        </a>
      </section>

      {!summary.configured ? (
        <section className={styles.notice}>
          {"error" in summary && summary.error
            ? summary.error
            : "Şu an örnek veriler gösteriliyor. Canlı Google Sheets bağlantısı için web/.env.local dosyasına servis hesabı bilgileri eklenmeli."}
        </section>
      ) : null}

      <section className={styles.metrics} aria-label="Özet">
        <article>
          <span>İş Toplamı</span>
          <strong>{toCurrency(summary.totals.jobs)}</strong>
        </article>
        <article>
          <span>Tahsil Edilecek</span>
          <strong>{toCurrency(summary.totals.receivables)}</strong>
        </article>
        <article>
          <span>Gelir</span>
          <strong>{toCurrency(summary.totals.income)}</strong>
        </article>
        <article>
          <span>Gider</span>
          <strong>{toCurrency(summary.totals.expenses)}</strong>
        </article>
      </section>

      <section className={styles.grid}>
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2>Son İşler</h2>
            <span>{recentJobs.length} kayıt</span>
          </div>
          <div className={styles.table}>
            {recentJobs.map((record) => (
              <div className={styles.row} key={`${record.customer}-${record.job}-${record.amount}`}>
                <div>
                  <strong>{record.customer}</strong>
                  <span>{record.job}</span>
                </div>
                <b>{toCurrency(record.amount)}</b>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2>Tahsilat Takibi</h2>
            <span>{openReceivables.length} açık kayıt</span>
          </div>
          <div className={styles.table}>
            {openReceivables.map((record) => (
              <div className={styles.row} key={`${record.customer}-${record.status}`}>
                <div>
                  <strong>{record.customer}</strong>
                  <span>{record.status}</span>
                </div>
                <b>{toCurrency(record.amount)}</b>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
