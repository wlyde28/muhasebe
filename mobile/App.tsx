import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardTypeOptions,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type EntryPage = 'income' | 'expense' | 'kaplanIncome' | 'kaplanExpense';
type PageKey = 'summary' | EntryPage | 'collection' | 'collected';
type RecordType = 'job' | 'expense' | 'payment';
type PaymentStatus = 'Tahsil Edilmedi' | 'Tahsil Edildi';

type WorkRecord = {
  rowNumber?: number;
  customer: string;
  job: string;
  amount: number;
  date?: string;
  status?: string;
};

type TransactionRecord = {
  rowNumber?: number;
  date: string;
  type: string;
  category: string;
  description: string;
  amount: number;
  paymentType: string;
};

type AppRecord = {
  id: string;
  date: string;
  customer: string;
  jobType: string;
  description: string;
  amount: number;
  paymentStatus: string;
  paymentType: string;
  employee: string;
};

type AccountingSummary = {
  configured: boolean;
  totals: {
    jobs: number;
    receivables: number;
    income: number;
    expenses: number;
    collected: number;
    net: number;
  };
  jobs: WorkRecord[];
  receivables: WorkRecord[];
  transactions: TransactionRecord[];
  appRecords: AppRecord[];
};

type FormState = {
  employee: string;
  customer: string;
  phone: string;
  category: string;
  description: string;
  amount: string;
  paymentType: string;
  paymentStatus: PaymentStatus;
};

type ReceivableEditState = {
  rowNumber: number;
  customer: string;
  job: string;
  amount: string;
  status: PaymentStatus;
};

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/api/records';
const APP_PIN = process.env.EXPO_PUBLIC_APP_PIN ?? '';

const requestHeaders = {
  'Content-Type': 'application/json',
  ...(APP_PIN ? { 'x-app-pin': APP_PIN } : {}),
};

const initialForm: FormState = {
  employee: '',
  customer: '',
  phone: '',
  category: 'Klima Montajı',
  description: '',
  amount: '',
  paymentType: 'Nakit',
  paymentStatus: 'Tahsil Edilmedi',
};

const entryConfig: Record<EntryPage, { title: string; subtitle: string; action: string; recordType: RecordType }> = {
  income: {
    title: 'Gelir',
    subtitle: 'Yeni yapılan işi veya satışı kaydet',
    action: 'Geliri Kaydet',
    recordType: 'job',
  },
  expense: {
    title: 'Gider',
    subtitle: 'Yaptığın masrafın açıklamasını ve tutarını gir',
    action: 'Gideri Kaydet',
    recordType: 'expense',
  },
  kaplanIncome: {
    title: 'Kaplan Teknik Gelir',
    subtitle: 'Kaplan Teknik için yapılan işi ayrı takip et',
    action: 'Kaplan Geliri Kaydet',
    recordType: 'job',
  },
  kaplanExpense: {
    title: 'Kaplan Teknik Gider',
    subtitle: 'Kaplan Teknik masraflarını ayrı takip et',
    action: 'Kaplan Gideri Kaydet',
    recordType: 'expense',
  },
};

function currency(amount: number) {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 0,
  }).format(amount);
}

function parseAmount(value: string) {
  return Number(value.replace(/\./g, '').replace(',', '.'));
}

function isKaplanRecord(record: Pick<TransactionRecord, 'category' | 'description'>) {
  const text = `${record.category} ${record.description}`.toLocaleLowerCase('tr-TR');
  return text.includes('kaplan teknik');
}

export default function App() {
  const [summary, setSummary] = useState<AccountingSummary | null>(null);
  const [activePage, setActivePage] = useState<PageKey>('summary');
  const [form, setForm] = useState<FormState>(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingReceivable, setEditingReceivable] = useState<ReceivableEditState | null>(null);

  const entryPage: EntryPage =
    activePage === 'expense' || activePage === 'kaplanIncome' || activePage === 'kaplanExpense'
      ? activePage
      : 'income';
  const activeConfig = entryConfig[entryPage];

  const openReceivables = useMemo(
    () =>
      summary?.receivables
        .filter((record) => record.customer && record.amount > 0 && record.status !== 'Tahsil Edildi')
        .slice(0, 12) ?? [],
    [summary],
  );
  const collectedReceivables = useMemo(
    () =>
      summary?.receivables
        .filter((record) => record.customer && record.amount > 0 && record.status === 'Tahsil Edildi')
        .slice(0, 24)
        .reverse() ?? [],
    [summary],
  );
  const incomeTransactions = useMemo(
    () =>
      summary?.transactions
        .filter((record) => record.type === 'Gelir' && record.amount > 0 && !isKaplanRecord(record))
        .slice(-10)
        .reverse() ?? [],
    [summary],
  );
  const expenseTransactions = useMemo(
    () =>
      summary?.transactions
        .filter((record) => record.type === 'Gider' && record.amount > 0 && !isKaplanRecord(record))
        .slice(-10)
        .reverse() ?? [],
    [summary],
  );
  const kaplanIncomeTransactions = useMemo(
    () =>
      summary?.transactions
        .filter((record) => record.type === 'Gelir' && record.amount > 0 && isKaplanRecord(record))
        .slice(-10)
        .reverse() ?? [],
    [summary],
  );
  const kaplanExpenseTransactions = useMemo(
    () =>
      summary?.transactions
        .filter((record) => record.type === 'Gider' && record.amount > 0 && isKaplanRecord(record))
        .slice(-10)
        .reverse() ?? [],
    [summary],
  );
  const recentTransactions = useMemo(
    () =>
      summary?.transactions
        .filter((record) => record.date && record.type && record.amount > 0)
        .slice(-8)
        .reverse() ?? [],
    [summary],
  );
  const recentAppRecords = useMemo(() => summary?.appRecords.slice(-6).reverse() ?? [], [summary]);
  const kaplanOpenReceivables = useMemo(
    () =>
      summary?.receivables
        .filter((record) => record.amount > 0 && record.status !== 'Tahsil Edildi' && record.job.includes('Kaplan Teknik'))
        .slice(0, 10)
        .reverse() ?? [],
    [summary],
  );

  const loadSummary = useCallback(async () => {
    try {
      setError(null);
      const response = await fetch(API_URL);

      if (!response.ok) {
        throw new Error('Veriler alınamadı.');
      }

      setSummary(await response.json());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Bilinmeyen hata');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  function updateForm(key: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function defaultCategory(page: EntryPage) {
    if (page === 'expense') return 'Gider';
    if (page === 'kaplanExpense') return 'Kaplan Teknik Gider';
    if (page === 'kaplanIncome') return 'Kaplan Teknik';
    return 'Klima Montajı';
  }

  function resetForm(page: EntryPage) {
    setForm((current) => ({
      ...initialForm,
      employee: current.employee,
      paymentType: current.paymentType,
      category: defaultCategory(page),
      paymentStatus: page === 'income' ? 'Tahsil Edilmedi' : 'Tahsil Edildi',
    }));
  }

  function switchPage(page: PageKey) {
    setActivePage(page);

    if (page === 'income' || page === 'expense' || page === 'kaplanIncome' || page === 'kaplanExpense') {
      setForm((current) => ({
        ...current,
        category: defaultCategory(page),
        paymentStatus: page === 'income' || page === 'kaplanIncome' ? current.paymentStatus : 'Tahsil Edildi',
      }));
    }
  }

  async function submitRecord() {
    const numericAmount = parseAmount(form.amount);

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      Alert.alert('Tutar gerekli', 'Lütfen sıfırdan büyük bir tutar gir.');
      return;
    }

    if (entryPage !== 'expense' && entryPage !== 'kaplanExpense' && !form.customer.trim()) {
      Alert.alert('Müşteri gerekli', 'Gelir ve tahsilat kayıtlarında müşteri adı gir.');
      return;
    }

    try {
      setSaving(true);
      const kaplan = entryPage === 'kaplanIncome' || entryPage === 'kaplanExpense';
      const category =
        entryPage === 'kaplanIncome'
          ? 'Kaplan Teknik'
          : kaplan && !form.category.includes('Kaplan Teknik')
            ? `Kaplan Teknik - ${form.category}`
            : form.category;

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify({
          recordType: activeConfig.recordType,
          customer: form.customer,
          phone: form.phone,
          jobType: category,
          description: form.description,
          amount: numericAmount,
          paymentStatus: entryPage === 'income' || entryPage === 'kaplanIncome' ? form.paymentStatus : 'Tahsil Edildi',
          paymentType: form.paymentType,
          employee: form.employee,
          note: kaplan ? 'Kaplan Teknik' : '',
        }),
      });

      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.detail ?? body.error ?? 'Kayıt eklenemedi');
      }

      resetForm(entryPage);
      await loadSummary();
      Alert.alert('Kaydedildi', `${activeConfig.title} kaydı Google Sheet tablosuna işlendi.`);
    } catch (caught) {
      Alert.alert('Kayıt eklenemedi', caught instanceof Error ? caught.message : 'Bilinmeyen hata');
    } finally {
      setSaving(false);
    }
  }

  async function deleteRecord(id: string) {
    try {
      setSaving(true);
      const response = await fetch(`${API_URL}?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: requestHeaders,
      });

      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.detail ?? body.error ?? 'Kayıt silinemedi');
      }

      await loadSummary();
    } catch (caught) {
      Alert.alert('Silinemedi', caught instanceof Error ? caught.message : 'Bilinmeyen hata');
    } finally {
      setSaving(false);
    }
  }

  function confirmDeleteTransaction(record: TransactionRecord) {
    Alert.alert(
      'Hareket silinsin mi?',
      `${record.description || record.category} kaydı silinecek.`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Sil', style: 'destructive', onPress: () => deleteTransaction(record) },
      ],
    );
  }

  async function deleteTransaction(record: TransactionRecord) {
    if (!record.rowNumber) {
      Alert.alert('Satır bulunamadı', 'Bu hareketin Google Sheets satırı belirlenemedi.');
      return;
    }

    try {
      setSaving(true);
      const response = await fetch(`${API_URL}?type=transaction&rowNumber=${record.rowNumber}`, {
        method: 'DELETE',
        headers: requestHeaders,
      });

      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.detail ?? body.error ?? 'Hareket silinemedi');
      }

      await loadSummary();
    } catch (caught) {
      Alert.alert('Silinemedi', caught instanceof Error ? caught.message : 'Bilinmeyen hata');
    } finally {
      setSaving(false);
    }
  }

  function confirmMarkCollected(record: WorkRecord) {
    Alert.alert(
      'Tahsil edildi mi?',
      `${record.customer} için ${currency(record.amount)} tahsil edildi olarak işlenecek.`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Tahsil Edildi',
          onPress: () => markCollected(record),
        },
      ],
    );
  }

  async function markCollected(record: WorkRecord) {
    if (!record.rowNumber) {
      Alert.alert('Satır bulunamadı', 'Bu kaydın Google Sheets satırı belirlenemedi.');
      return;
    }

    try {
      setSaving(true);
      const response = await fetch(API_URL, {
        method: 'PATCH',
        headers: requestHeaders,
        body: JSON.stringify({
          action: 'mark_receivable_collected',
          rowNumber: record.rowNumber,
          paymentType: form.paymentType,
          employee: form.employee,
        }),
      });

      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.detail ?? body.error ?? 'Tahsilat güncellenemedi');
      }

      await loadSummary();
      Alert.alert('Güncellendi', `${record.customer} tahsil edildi olarak işlendi.`);
    } catch (caught) {
      Alert.alert('Güncellenemedi', caught instanceof Error ? caught.message : 'Bilinmeyen hata');
    } finally {
      setSaving(false);
    }
  }

  function confirmMarkUncollected(record: WorkRecord) {
    Alert.alert(
      'Tahsilat geri açılsın mı?',
      `${record.customer} tekrar tahsil edilmedi olarak görünecek.`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Geri Aç', onPress: () => markUncollected(record) },
      ],
    );
  }

  async function markUncollected(record: WorkRecord) {
    if (!record.rowNumber) {
      Alert.alert('Satır bulunamadı', 'Bu kaydın Google Sheets satırı belirlenemedi.');
      return;
    }

    try {
      setSaving(true);
      const response = await fetch(API_URL, {
        method: 'PATCH',
        headers: requestHeaders,
        body: JSON.stringify({
          action: 'mark_receivable_uncollected',
          rowNumber: record.rowNumber,
        }),
      });

      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.detail ?? body.error ?? 'Tahsilat geri açılamadı');
      }

      await loadSummary();
      Alert.alert('Geri açıldı', `${record.customer} tekrar açık tahsilata alındı.`);
    } catch (caught) {
      Alert.alert('Güncellenemedi', caught instanceof Error ? caught.message : 'Bilinmeyen hata');
    } finally {
      setSaving(false);
    }
  }

  function startEditReceivable(record: WorkRecord) {
    if (!record.rowNumber) {
      Alert.alert('Satır bulunamadı', 'Bu kaydın Google Sheets satırı belirlenemedi.');
      return;
    }

    setEditingReceivable({
      rowNumber: record.rowNumber,
      customer: record.customer,
      job: record.job,
      amount: String(record.amount),
      status: (record.status === 'Tahsil Edildi' ? 'Tahsil Edildi' : 'Tahsil Edilmedi') as PaymentStatus,
    });
    setActivePage('collection');
  }

  function updateReceivableEdit(key: keyof ReceivableEditState, value: string) {
    setEditingReceivable((current) => (current ? { ...current, [key]: value } : current));
  }

  async function saveReceivableEdit() {
    if (!editingReceivable) return;

    const amount = parseAmount(editingReceivable.amount);

    if (!editingReceivable.customer.trim() || !editingReceivable.job.trim()) {
      Alert.alert('Eksik bilgi', 'Müşteri ve iş açıklaması boş olamaz.');
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert('Tutar gerekli', 'Lütfen sıfırdan büyük bir tutar gir.');
      return;
    }

    try {
      setSaving(true);
      const response = await fetch(API_URL, {
        method: 'PATCH',
        headers: requestHeaders,
        body: JSON.stringify({
          action: 'update_receivable',
          rowNumber: editingReceivable.rowNumber,
          customer: editingReceivable.customer,
          job: editingReceivable.job,
          amount,
          status: editingReceivable.status,
        }),
      });

      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.detail ?? body.error ?? 'Tahsilat düzenlenemedi');
      }

      setEditingReceivable(null);
      await loadSummary();
      Alert.alert('Güncellendi', 'Açık tahsilat kaydı düzenlendi.');
    } catch (caught) {
      Alert.alert('Güncellenemedi', caught instanceof Error ? caught.message : 'Bilinmeyen hata');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadSummary} tintColor="#ffffff" />}
      >
        <View style={styles.hero}>
          <Text style={styles.company}>Durukan Klima</Text>
          <Text style={styles.title}>Muhasebe</Text>
          <View style={styles.heroFooter}>
            <SummaryPill label="Net Kar" value={currency(summary?.totals.net ?? 0)} />
            <SummaryPill label="Tahsil Edilmeyen" value={currency(summary?.totals.receivables ?? 0)} />
          </View>
        </View>

        {loading && !summary ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color="#ffffff" />
            <Text style={styles.loadingText}>Veriler yükleniyor</Text>
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.pageTabs}>
          <PageTab active={activePage === 'summary'} label="Özet" onPress={() => switchPage('summary')} />
          <PageTab active={activePage === 'income'} label="Gelir" onPress={() => switchPage('income')} />
          <PageTab active={activePage === 'expense'} label="Gider" onPress={() => switchPage('expense')} />
          <PageTab active={activePage === 'kaplanIncome'} label="Kaplan Gelir" onPress={() => switchPage('kaplanIncome')} />
          <PageTab active={activePage === 'kaplanExpense'} label="Kaplan Gider" onPress={() => switchPage('kaplanExpense')} />
          <PageTab active={activePage === 'collection'} label="Tahsilat" onPress={() => switchPage('collection')} />
          <PageTab active={activePage === 'collected'} label="Tahsil Edilen" onPress={() => switchPage('collected')} />
        </View>

        {activePage === 'summary' ? (
          <SummaryPage
            summary={summary}
            recentTransactions={recentTransactions}
            recentAppRecords={recentAppRecords}
            collectedReceivables={collectedReceivables}
            onDeleteRecord={deleteRecord}
          />
        ) : null}

        {activePage === 'income' ? (
          <EntryPageView
            page="income"
            config={activeConfig}
            form={form}
            saving={saving}
            transactions={incomeTransactions}
            onSubmit={submitRecord}
            onUpdateForm={updateForm}
            onDeleteTransaction={confirmDeleteTransaction}
          />
        ) : null}

        {activePage === 'expense' ? (
          <EntryPageView
            page="expense"
            config={activeConfig}
            form={form}
            saving={saving}
            transactions={expenseTransactions}
            onSubmit={submitRecord}
            onUpdateForm={updateForm}
            onDeleteTransaction={confirmDeleteTransaction}
          />
        ) : null}

        {activePage === 'kaplanIncome' ? (
          <EntryPageView
            page="kaplanIncome"
            config={activeConfig}
            form={form}
            saving={saving}
            transactions={kaplanIncomeTransactions}
            extraReceivables={kaplanOpenReceivables}
            onSubmit={submitRecord}
            onUpdateForm={updateForm}
            onDeleteTransaction={confirmDeleteTransaction}
            onEditReceivable={startEditReceivable}
          />
        ) : null}

        {activePage === 'kaplanExpense' ? (
          <EntryPageView
            page="kaplanExpense"
            config={activeConfig}
            form={form}
            saving={saving}
            transactions={kaplanExpenseTransactions}
            onSubmit={submitRecord}
            onUpdateForm={updateForm}
            onDeleteTransaction={confirmDeleteTransaction}
          />
        ) : null}

        {activePage === 'collection' ? (
          <CollectionPage
            receivables={openReceivables}
            onMarkCollected={confirmMarkCollected}
            editingReceivable={editingReceivable}
            saving={saving}
            onEditReceivable={startEditReceivable}
            onCancelEdit={() => setEditingReceivable(null)}
            onUpdateEdit={updateReceivableEdit}
            onSaveEdit={saveReceivableEdit}
          />
        ) : null}

        {activePage === 'collected' ? (
          <CollectedPage receivables={collectedReceivables} onMarkUncollected={confirmMarkUncollected} />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function SummaryPage({
  summary,
  recentTransactions,
  recentAppRecords,
  collectedReceivables,
  onDeleteRecord,
}: {
  summary: AccountingSummary | null;
  recentTransactions: TransactionRecord[];
  recentAppRecords: AppRecord[];
  collectedReceivables: WorkRecord[];
  onDeleteRecord: (id: string) => void;
}) {
  const collectedTotal = collectedReceivables.reduce((sum, record) => sum + record.amount, 0);
  const netProfit = collectedTotal - (summary?.totals.expenses ?? 0);

  return (
    <>
      <View style={styles.summaryGrid}>
        <Metric label="Net Kar" value={currency(netProfit)} tone="green" />
        <Metric label="Tahsil Edilmeyen" value={currency(summary?.totals.receivables ?? 0)} tone="orange" />
        <Metric label="Gider" value={currency(summary?.totals.expenses ?? 0)} tone="red" />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Son Hareketler</Text>
        {recentTransactions.length === 0 ? <Text style={styles.empty}>Henüz hareket yok.</Text> : null}
        {recentTransactions.map((record, index) => (
          <ListRow
            key={`${record.date}-${record.description}-${record.amount}-${index}`}
            title={record.description || record.category}
            subtitle={`${record.date} · ${record.type} · ${record.paymentType}`}
            value={currency(record.amount)}
            tone={record.type === 'Gider' ? 'red' : 'green'}
          />
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Uygulama Kayıtları</Text>
        {recentAppRecords.length === 0 ? <Text style={styles.empty}>Uygulamadan eklenen kayıt yok.</Text> : null}
        {recentAppRecords.map((record) => (
          <View style={styles.deletableRow} key={record.id}>
            <ListRow
              title={record.customer || record.jobType}
              subtitle={`${record.date} · ${record.employee || 'Saha'} · ${record.jobType}`}
              value={currency(record.amount)}
              tone="blue"
            />
            <Pressable style={styles.deleteButton} onPress={() => onDeleteRecord(record.id)} hitSlop={10}>
              <Text style={styles.deleteText}>Sil</Text>
            </Pressable>
          </View>
        ))}
      </View>
    </>
  );
}

function EntryPageView({
  page,
  config,
  form,
  saving,
  transactions,
  extraReceivables = [],
  onSubmit,
  onUpdateForm,
  onDeleteTransaction,
  onEditReceivable,
}: {
  page: EntryPage;
  config: { title: string; subtitle: string; action: string };
  form: FormState;
  saving: boolean;
  transactions: TransactionRecord[];
  extraReceivables?: WorkRecord[];
  onSubmit: () => void;
  onUpdateForm: (key: keyof FormState, value: string) => void;
  onDeleteTransaction: (record: TransactionRecord) => void;
  onEditReceivable?: (record: WorkRecord) => void;
}) {
  const expensePage = page === 'expense' || page === 'kaplanExpense';

  return (
    <>
      <RecordForm
        page={page}
        config={config}
        form={form}
        saving={saving}
        onSubmit={onSubmit}
        onUpdateForm={onUpdateForm}
      />
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{expensePage ? 'Gider Hareketleri' : 'Gelir Hareketleri'}</Text>
        {transactions.length === 0 && extraReceivables.length === 0 ? <Text style={styles.empty}>Henüz hareket yok.</Text> : null}
        {extraReceivables.map((record) => (
          <ListRow
            key={`receivable-${record.rowNumber}-${record.customer}-${record.amount}`}
            title={record.customer}
            subtitle={`${record.job} · açık tahsilat`}
            value={currency(record.amount)}
            tone="orange"
            actionLabel="Düzenle"
            onAction={onEditReceivable ? () => onEditReceivable(record) : undefined}
          />
        ))}
        {transactions.map((record, index) => (
          <ListRow
            key={`${record.date}-${record.description}-${record.amount}-${index}`}
            title={record.description || record.category}
            subtitle={`${record.date} · ${record.paymentType}`}
            value={currency(record.amount)}
            tone={expensePage ? 'red' : 'green'}
            actionLabel="Sil"
            onAction={() => onDeleteTransaction(record)}
          />
        ))}
      </View>
    </>
  );
}

function CollectionPage({
  receivables,
  onMarkCollected,
  editingReceivable,
  saving,
  onEditReceivable,
  onCancelEdit,
  onUpdateEdit,
  onSaveEdit,
}: {
  receivables: WorkRecord[];
  onMarkCollected: (record: WorkRecord) => void;
  editingReceivable: ReceivableEditState | null;
  saving: boolean;
  onEditReceivable: (record: WorkRecord) => void;
  onCancelEdit: () => void;
  onUpdateEdit: (key: keyof ReceivableEditState, value: string) => void;
  onSaveEdit: () => void;
}) {
  return (
    <>
      {editingReceivable ? (
        <View style={styles.formCard}>
          <View style={styles.formHeader}>
            <View>
              <Text style={styles.formTitle}>Tahsilat Düzenle</Text>
              <Text style={styles.formSubtitle}>Müşteri, iş açıklaması ve tutarı düzelt</Text>
            </View>
            <Text style={styles.formBadge}>Satır {editingReceivable.rowNumber}</Text>
          </View>
          <Input
            label="Müşteri"
            value={editingReceivable.customer}
            onChangeText={(value) => onUpdateEdit('customer', value)}
            placeholder="Müşteri adı"
          />
          <Input
            label="İş / Açıklama"
            value={editingReceivable.job}
            onChangeText={(value) => onUpdateEdit('job', value)}
            placeholder="İş açıklaması"
          />
          <Input
            label="Tutar"
            value={editingReceivable.amount}
            onChangeText={(value) => onUpdateEdit('amount', value)}
            placeholder="0"
            keyboardType="decimal-pad"
          />
          <Segmented
            label="Durum"
            value={editingReceivable.status}
            options={[
              ['Tahsil Edilmedi', 'Açık'],
              ['Tahsil Edildi', 'Ödendi'],
            ]}
            onChange={(value) => onUpdateEdit('status', value)}
          />
          <View style={styles.formActions}>
            <Pressable style={styles.secondaryButton} onPress={onCancelEdit} disabled={saving}>
              <Text style={styles.secondaryButtonText}>Vazgeç</Text>
            </Pressable>
            <Pressable style={[styles.primaryButtonInline, saving && styles.disabled]} onPress={onSaveEdit} disabled={saving}>
              <Text style={styles.primaryButtonText}>{saving ? 'Kaydediliyor' : 'Kaydet'}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Açık Tahsilatlar</Text>
        {receivables.length === 0 ? <Text style={styles.empty}>Açık tahsilat görünmüyor.</Text> : null}
        {receivables.map((record) => (
          <ListRow
            key={`${record.rowNumber}-${record.customer}-${record.amount}`}
            title={record.customer}
            subtitle={`${record.job} · dokun, tahsil edildi yap`}
            value={currency(record.amount)}
            tone="orange"
            onPress={() => onMarkCollected(record)}
            actionLabel="Düzenle"
            onAction={() => onEditReceivable(record)}
          />
        ))}
      </View>
    </>
  );
}

function CollectedPage({
  receivables,
  onMarkUncollected,
}: {
  receivables: WorkRecord[];
  onMarkUncollected: (record: WorkRecord) => void;
}) {
  const collectedTotal = receivables.reduce((sum, record) => sum + record.amount, 0);

  return (
    <>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Tahsil Edilen Toplam</Text>
        <View style={styles.totalBand}>
          <Text style={styles.totalBandLabel}>Kasaya giren</Text>
          <Text style={styles.totalBandValue}>{currency(collectedTotal)}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Tahsil Edilenler</Text>
        {receivables.length === 0 ? <Text style={styles.empty}>Henüz tahsil edilen kayıt yok.</Text> : null}
        {receivables.map((record) => (
          <ListRow
            key={`${record.rowNumber}-${record.customer}-${record.amount}`}
            title={record.customer}
            subtitle={`${record.job} · tahsil edildi`}
            value={currency(record.amount)}
            tone="green"
            actionLabel="Geri Aç"
            onAction={() => onMarkUncollected(record)}
          />
        ))}
      </View>
    </>
  );
}

function RecordForm({
  page,
  config,
  form,
  saving,
  onSubmit,
  onUpdateForm,
}: {
  page: EntryPage;
  config: { title: string; subtitle: string; action: string };
  form: FormState;
  saving: boolean;
  onSubmit: () => void;
  onUpdateForm: (key: keyof FormState, value: string) => void;
}) {
  const expensePage = page === 'expense' || page === 'kaplanExpense';
  const lockedKaplanIncome = page === 'kaplanIncome';

  return (
    <View style={styles.formCard}>
      <View style={styles.formHeader}>
        <View>
          <Text style={styles.formTitle}>{config.title}</Text>
          <Text style={styles.formSubtitle}>{config.subtitle}</Text>
        </View>
        <Text style={styles.formBadge}>{form.paymentType}</Text>
      </View>

      <Input label="Eleman" value={form.employee} onChangeText={(value) => onUpdateForm('employee', value)} placeholder="Örn. Ahmet" />
      {!expensePage ? (
        <>
          <Input label="Müşteri" value={form.customer} onChangeText={(value) => onUpdateForm('customer', value)} placeholder="Müşteri adı" />
          <Input label="Telefon" value={form.phone} onChangeText={(value) => onUpdateForm('phone', value)} placeholder="İsteğe bağlı" keyboardType="phone-pad" />
          {lockedKaplanIncome ? (
            <View style={styles.lockedField}>
              <Text style={styles.inputLabel}>İş / İşlem</Text>
              <Text style={styles.lockedFieldText}>Kaplan Teknik</Text>
            </View>
          ) : (
            <Input
              label="İş / İşlem"
              value={form.category}
              onChangeText={(value) => onUpdateForm('category', value)}
              placeholder="Klima montajı, servis..."
            />
          )}
        </>
      ) : null}
      <Input
        label={expensePage ? 'Gider Açıklaması' : 'Açıklama'}
        value={form.description}
        onChangeText={(value) => onUpdateForm('description', value)}
        placeholder={expensePage ? 'Örn. yakıt, yemek, malzeme alımı' : 'Kısa açıklama'}
      />
      <Input label="Tutar" value={form.amount} onChangeText={(value) => onUpdateForm('amount', value)} placeholder="0" keyboardType="decimal-pad" />

      <Segmented
        label="Ödeme Türü"
        value={form.paymentType}
        options={[
          ['Nakit', 'Nakit'],
          ['Kart', 'Kart'],
          ['Havale', 'Havale'],
        ]}
        onChange={(value) => onUpdateForm('paymentType', value)}
      />

      {page === 'income' || page === 'kaplanIncome' ? (
        <Segmented
          label="Tahsilat Durumu"
          value={form.paymentStatus}
          options={[
            ['Tahsil Edilmedi', 'Açık'],
            ['Tahsil Edildi', 'Ödendi'],
          ]}
          onChange={(value) => onUpdateForm('paymentStatus', value as PaymentStatus)}
        />
      ) : null}

      <Pressable style={[styles.primaryButton, saving && styles.disabled]} onPress={onSubmit} disabled={saving}>
        <Text style={styles.primaryButtonText}>{saving ? 'Kaydediliyor' : config.action}</Text>
      </Pressable>
    </View>
  );
}

function SummaryPill({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryPill}>
      <Text style={styles.summaryPillLabel}>{label}</Text>
      <Text style={styles.summaryPillValue}>{value}</Text>
    </View>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: 'green' | 'red' | 'blue' | 'orange' }) {
  return (
    <View style={styles.metric}>
      <View style={[styles.metricDot, styles[`${tone}Dot`]]} />
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function PageTab({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable style={[styles.pageTab, active && styles.pageTabActive]} onPress={onPress}>
      <Text style={[styles.pageTabText, active && styles.pageTabTextActive]}>{label}</Text>
    </Pressable>
  );
}

function Input(props: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
}) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{props.label}</Text>
      <TextInput
        style={styles.input}
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        keyboardType={props.keyboardType ?? 'default'}
        placeholderTextColor="#8a958f"
      />
    </View>
  );
}

function Segmented({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: [string, string][];
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.segmentGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      <View style={styles.segmented}>
        {options.map(([optionValue, optionLabel]) => (
          <Pressable
            key={optionValue}
            style={[styles.segment, value === optionValue && styles.segmentActive]}
            onPress={() => onChange(optionValue)}
          >
            <Text style={[styles.segmentText, value === optionValue && styles.segmentTextActive]}>{optionLabel}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function ListRow({
  title,
  subtitle,
  value,
  tone,
  onPress,
  actionLabel,
  onAction,
}: {
  title: string;
  subtitle: string;
  value: string;
  tone: 'green' | 'red' | 'blue' | 'orange';
  onPress?: () => void;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const content = (
    <>
      <View style={[styles.rowMark, styles[`${tone}Mark`]]} />
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.rowSubtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <View style={styles.rowSide}>
        <Text style={[styles.rowValue, styles[`${tone}Text`]]}>{value}</Text>
        {actionLabel && onAction ? (
          <Pressable onPress={onAction} hitSlop={8}>
            <Text style={styles.inlineAction}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </>
  );

  if (onPress) {
    return (
      <Pressable style={({ pressed }) => [styles.listRow, pressed && styles.rowPressed]} onPress={onPress}>
        {content}
      </Pressable>
    );
  }

  return <View style={styles.listRow}>{content}</View>;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#11231b',
  },
  content: {
    padding: 16,
    paddingBottom: 34,
  },
  hero: {
    backgroundColor: '#163426',
    borderRadius: 18,
    marginBottom: 14,
    overflow: 'hidden',
    padding: 20,
  },
  company: {
    color: '#b8d8c8',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 8,
  },
  title: {
    color: '#ffffff',
    fontSize: 38,
    fontWeight: '900',
    letterSpacing: 0,
  },
  heroFooter: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  summaryPill: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    padding: 12,
  },
  summaryPillLabel: {
    color: '#b8d8c8',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 4,
  },
  summaryPillValue: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '900',
  },
  loadingBox: {
    alignItems: 'center',
    backgroundColor: '#1d3c2c',
    borderRadius: 12,
    gap: 8,
    marginBottom: 12,
    padding: 16,
  },
  loadingText: {
    color: '#ffffff',
    fontWeight: '800',
  },
  error: {
    backgroundColor: '#ffe7e4',
    borderRadius: 12,
    color: '#8b1f16',
    marginBottom: 12,
    padding: 12,
  },
  pageTabs: {
    backgroundColor: '#dfeae4',
    borderRadius: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginBottom: 12,
    padding: 5,
  },
  pageTab: {
    alignItems: 'center',
    borderRadius: 10,
    flexGrow: 1,
    flexBasis: '30%',
    minHeight: 42,
    justifyContent: 'center',
  },
  pageTabActive: {
    backgroundColor: '#ffffff',
  },
  pageTabText: {
    color: '#52615b',
    fontSize: 12,
    fontWeight: '900',
  },
  pageTabTextActive: {
    color: '#11231b',
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  metric: {
    backgroundColor: '#f8fbf9',
    borderRadius: 14,
    flex: 1,
    minHeight: 92,
    padding: 12,
  },
  metricDot: {
    borderRadius: 4,
    height: 8,
    marginBottom: 10,
    width: 28,
  },
  greenDot: {
    backgroundColor: '#1f8b54',
  },
  redDot: {
    backgroundColor: '#c4483c',
  },
  blueDot: {
    backgroundColor: '#2f6fb3',
  },
  orangeDot: {
    backgroundColor: '#d4822f',
  },
  metricLabel: {
    color: '#65736c',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 5,
  },
  metricValue: {
    color: '#16231d',
    fontSize: 16,
    fontWeight: '900',
  },
  formCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    marginBottom: 12,
    padding: 14,
  },
  formHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 6,
  },
  formTitle: {
    color: '#13231b',
    fontSize: 24,
    fontWeight: '900',
  },
  formSubtitle: {
    color: '#65736c',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
    maxWidth: 240,
  },
  formBadge: {
    backgroundColor: '#edf5f0',
    borderRadius: 9,
    color: '#12643d',
    fontSize: 12,
    fontWeight: '900',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  inputGroup: {
    marginTop: 10,
  },
  inputLabel: {
    color: '#52615b',
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#f5f8f6',
    borderColor: '#d6e1dc',
    borderRadius: 11,
    borderWidth: 1,
    color: '#17211d',
    minHeight: 48,
    paddingHorizontal: 12,
  },
  segmentGroup: {
    marginTop: 12,
  },
  segmented: {
    flexDirection: 'row',
    gap: 8,
  },
  segment: {
    alignItems: 'center',
    backgroundColor: '#f5f8f6',
    borderColor: '#d6e1dc',
    borderRadius: 11,
    borderWidth: 1,
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
  },
  segmentActive: {
    backgroundColor: '#12643d',
    borderColor: '#12643d',
  },
  segmentText: {
    color: '#52615b',
    fontWeight: '900',
  },
  segmentTextActive: {
    color: '#ffffff',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#12643d',
    borderRadius: 12,
    marginTop: 16,
    minHeight: 52,
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.65,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
  },
  primaryButtonInline: {
    alignItems: 'center',
    backgroundColor: '#12643d',
    borderRadius: 12,
    flex: 1,
    minHeight: 48,
    justifyContent: 'center',
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#eef4f0',
    borderRadius: 12,
    flex: 1,
    minHeight: 48,
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: '#52615b',
    fontSize: 15,
    fontWeight: '900',
  },
  formActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  lockedField: {
    marginTop: 10,
  },
  lockedFieldText: {
    backgroundColor: '#eef4f0',
    borderColor: '#d6e1dc',
    borderRadius: 11,
    borderWidth: 1,
    color: '#12643d',
    fontSize: 15,
    fontWeight: '900',
    minHeight: 48,
    paddingHorizontal: 12,
    paddingTop: 14,
  },
  section: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    marginBottom: 12,
    overflow: 'hidden',
    paddingTop: 14,
  },
  sectionTitle: {
    color: '#16231d',
    fontSize: 17,
    fontWeight: '900',
    paddingHorizontal: 14,
    paddingBottom: 8,
  },
  empty: {
    color: '#65736c',
    padding: 14,
  },
  totalBand: {
    backgroundColor: '#f5f8f6',
    borderTopColor: '#edf2ef',
    borderTopWidth: 1,
    padding: 16,
  },
  totalBandLabel: {
    color: '#65736c',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 6,
  },
  totalBandValue: {
    color: '#1f8b54',
    fontSize: 26,
    fontWeight: '900',
  },
  listRow: {
    alignItems: 'center',
    borderTopColor: '#edf2ef',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 66,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  rowPressed: {
    backgroundColor: '#fff7ed',
  },
  rowMark: {
    borderRadius: 5,
    height: 34,
    width: 5,
  },
  greenMark: {
    backgroundColor: '#1f8b54',
  },
  redMark: {
    backgroundColor: '#c4483c',
  },
  blueMark: {
    backgroundColor: '#2f6fb3',
  },
  orangeMark: {
    backgroundColor: '#d4822f',
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    color: '#1b2822',
    fontSize: 14,
    fontWeight: '900',
  },
  rowSubtitle: {
    color: '#65736c',
    fontSize: 12,
    marginTop: 4,
  },
  rowValue: {
    fontSize: 14,
    fontWeight: '900',
  },
  rowSide: {
    alignItems: 'flex-end',
    gap: 6,
  },
  inlineAction: {
    color: '#b33128',
    fontSize: 12,
    fontWeight: '900',
  },
  greenText: {
    color: '#1f8b54',
  },
  redText: {
    color: '#c4483c',
  },
  blueText: {
    color: '#2f6fb3',
  },
  orangeText: {
    color: '#d4822f',
  },
  deletableRow: {
    position: 'relative',
  },
  deleteButton: {
    position: 'absolute',
    right: 14,
    top: 38,
  },
  deleteText: {
    color: '#b33128',
    fontSize: 12,
    fontWeight: '900',
  },
});
