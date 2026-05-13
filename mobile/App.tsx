import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Notifications from 'expo-notifications';
import * as Print from 'expo-print';
import * as SecureStore from 'expo-secure-store';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
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
import Svg, { Circle, Path } from 'react-native-svg';

type EntryPage = 'income' | 'expense' | 'kaplanIncome' | 'kaplanExpense';
type PageKey = 'summary' | EntryPage | 'collection' | 'collected' | 'partner' | 'customers' | 'kaplanLedger' | 'deleted';
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
  phone: string;
  jobType: string;
  description: string;
  amount: number;
  paymentStatus: string;
  paymentType: string;
  note: string;
  employee: string;
};

type DeletedRecord = {
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

type PartnerExpense = {
  rowNumber?: number;
  date: string;
  description: string;
  amount: number;
  payer: 'Durukan' | 'Şirin';
  share: number;
  status: 'Açık' | 'Kapandı';
};

type PartnerSummary = {
  youPaid: number;
  partnerPaid: number;
  partnerOwesYou: number;
  youOwePartner: number;
  net: number;
  openItems: PartnerExpense[];
  closedItems: PartnerExpense[];
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
  deletedRecords: DeletedRecord[];
  partner: PartnerSummary;
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
  sharedExpense: 'Hayır' | 'Evet';
  expensePayer: 'Durukan' | 'Şirin';
  date: string;
  photoUri: string;
};

type FilterState = {
  query: string;
  startDate: string;
  endDate: string;
};

const EMPLOYEES = ['Durukan', 'Şirin'] as const;
type EmployeeName = (typeof EMPLOYEES)[number];

type ReceivableEditState = {
  rowNumber: number;
  customer: string;
  job: string;
  amount: string;
  status: PaymentStatus;
};

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://web-theta-seven-73.vercel.app/api/records';
const APP_PIN = process.env.EXPO_PUBLIC_APP_PIN ?? '1234';
const LOCAL_PIN_KEY = 'durukan-local-pin';
const REMEMBER_PIN_KEY = 'durukan-remember-pin';
const REMEMBER_EMPLOYEE_KEY = 'durukan-remember-employee';
const NOTIFY_DATE_KEY = 'durukan-last-receivable-notification';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

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
  sharedExpense: 'Hayır',
  expensePayer: 'Durukan',
  date: todayInput(),
  photoUri: '',
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

function percent(part: number, total: number) {
  if (total <= 0) return 0;

  return Math.round((part / total) * 100);
}

function todayInput() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Istanbul',
  }).format(new Date());
}

function parseDateValue(value?: string) {
  if (!value) return 0;

  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (iso) {
    return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])).getTime();
  }

  const tr = value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);

  if (tr) {
    return new Date(Number(tr[3]), Number(tr[2]) - 1, Number(tr[1])).getTime();
  }

  return 0;
}

function monthKey(value?: string) {
  const tr = value?.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  const iso = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (tr) return `${tr[3]}-${tr[2]}`;
  if (iso) return `${iso[1]}-${iso[2]}`;

  return '';
}

function matchesFilter(record: { date?: string; customer?: string; job?: string; description?: string; category?: string; type?: string; paymentType?: string }, filters: FilterState) {
  const haystack = [record.customer, record.job, record.description, record.category, record.type, record.paymentType].join(' ').toLocaleLowerCase('tr-TR');
  const query = filters.query.trim().toLocaleLowerCase('tr-TR');
  const recordTime = parseDateValue(record.date);
  const startTime = parseDateValue(filters.startDate);
  const endTime = parseDateValue(filters.endDate);

  if (query && !haystack.includes(query)) return false;
  if (startTime && recordTime && recordTime < startTime) return false;
  if (endTime && recordTime && recordTime > endTime) return false;

  return true;
}

function parseAmount(value: string) {
  return Number(value.replace(/\./g, '').replace(',', '.'));
}

function isKaplanRecord(record: Pick<TransactionRecord, 'category' | 'description'>) {
  const text = `${record.category} ${record.description}`.toLocaleLowerCase('tr-TR');
  return text.includes('kaplan teknik');
}

function photoMarker(uri: string) {
  return uri ? `[FOTO:${uri}]` : '';
}

function stripMarkers(value: string) {
  return value.replace(/\s*\[(ORTAK|FOTO):[^\]]+\]\s*/g, ' ').trim();
}

function receiptHtml(record: WorkRecord) {
  return `
    <html>
      <body style="font-family: Arial; padding: 28px; color: #17211d;">
        <h1>Durukan Klima</h1>
        <h2>Tahsilat Makbuzu</h2>
        <p><strong>Müşteri:</strong> ${record.customer}</p>
        <p><strong>İş:</strong> ${record.job}</p>
        <p><strong>Tutar:</strong> ${currency(record.amount)}</p>
        <p><strong>Tarih:</strong> ${record.date ?? todayInput()}</p>
        <p><strong>Durum:</strong> Tahsil Edildi</p>
      </body>
    </html>
  `;
}

function monthlyReportHtml(month: string, transactions: TransactionRecord[]) {
  const incomeRows = transactions.filter((record) => record.type === 'Gelir');
  const expenseRows = transactions.filter((record) => record.type === 'Gider');
  const income = incomeRows.reduce((sum, record) => sum + record.amount, 0);
  const expenses = expenseRows.reduce((sum, record) => sum + record.amount, 0);
  const rows = transactions
    .map(
      (record) => `
        <tr>
          <td>${record.date}</td>
          <td>${record.type}</td>
          <td>${record.category}</td>
          <td>${stripMarkers(record.description)}</td>
          <td>${record.paymentType}</td>
          <td style="text-align:right">${currency(record.amount)}</td>
        </tr>
      `,
    )
    .join('');

  return `
    <html>
      <body style="font-family: Arial; padding: 28px; color: #17211d;">
        <h1>Aylık Gelir Gider Raporu</h1>
        <h2>${month}</h2>
        <div style="display:flex; gap:12px; margin:18px 0;">
          <div><strong>Gelir:</strong> ${currency(income)}</div>
          <div><strong>Gider:</strong> ${currency(expenses)}</div>
          <div><strong>Net:</strong> ${currency(income - expenses)}</div>
        </div>
        <table style="width:100%; border-collapse:collapse; font-size:12px;">
          <thead>
            <tr>
              <th style="text-align:left; border-bottom:1px solid #ccc;">Tarih</th>
              <th style="text-align:left; border-bottom:1px solid #ccc;">Tür</th>
              <th style="text-align:left; border-bottom:1px solid #ccc;">Kategori</th>
              <th style="text-align:left; border-bottom:1px solid #ccc;">Açıklama</th>
              <th style="text-align:left; border-bottom:1px solid #ccc;">Ödeme</th>
              <th style="text-align:right; border-bottom:1px solid #ccc;">Tutar</th>
            </tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="6">Bu ay için hareket yok.</td></tr>'}</tbody>
        </table>
      </body>
    </html>
  `;
}

export default function App() {
  const [summary, setSummary] = useState<AccountingSummary | null>(null);
  const [activePage, setActivePage] = useState<PageKey>('summary');
  const [form, setForm] = useState<FormState>(initialForm);
  const [currentEmployee, setCurrentEmployee] = useState<EmployeeName | null>(null);
  const [loginEmployee, setLoginEmployee] = useState<EmployeeName>('Durukan');
  const [pinInput, setPinInput] = useState('');
  const [savedPin, setSavedPin] = useState<string | null>(null);
  const [rememberPin, setRememberPin] = useState(false);
  const [creatingPin, setCreatingPin] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [filters, setFilters] = useState<FilterState>({ query: '', startDate: '', endDate: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingReceivable, setEditingReceivable] = useState<ReceivableEditState | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState('');

  const entryPage: EntryPage =
    activePage === 'expense' || activePage === 'kaplanIncome' || activePage === 'kaplanExpense'
      ? activePage
      : 'income';
  const activeConfig = entryConfig[entryPage];

  const openReceivables = useMemo(
    () =>
      summary?.receivables
        .filter((record) => record.customer && record.amount > 0 && record.status !== 'Tahsil Edildi')
        .filter((record) => matchesFilter(record, filters))
        .slice(0, 12) ?? [],
    [summary, filters],
  );
  const collectedReceivables = useMemo(
    () =>
      summary?.receivables
        .filter((record) => record.customer && record.amount > 0 && record.status === 'Tahsil Edildi')
        .filter((record) => matchesFilter(record, filters))
        .slice(0, 24)
        .reverse() ?? [],
    [summary, filters],
  );
  const incomeTransactions = useMemo(
    () =>
      summary?.transactions
        .filter((record) => record.type === 'Gelir' && record.amount > 0 && !isKaplanRecord(record))
        .filter((record) => matchesFilter(record, filters))
        .slice(-10)
        .reverse() ?? [],
    [summary, filters],
  );
  const expenseTransactions = useMemo(
    () =>
      summary?.transactions
        .filter((record) => record.type === 'Gider' && record.amount > 0 && !isKaplanRecord(record))
        .filter((record) => matchesFilter(record, filters))
        .slice(-10)
        .reverse() ?? [],
    [summary, filters],
  );
  const kaplanIncomeTransactions = useMemo(
    () =>
      summary?.transactions
        .filter((record) => record.type === 'Gelir' && record.amount > 0 && isKaplanRecord(record))
        .filter((record) => matchesFilter(record, filters))
        .slice(-10)
        .reverse() ?? [],
    [summary, filters],
  );
  const kaplanExpenseTransactions = useMemo(
    () =>
      summary?.transactions
        .filter((record) => record.type === 'Gider' && record.amount > 0 && isKaplanRecord(record))
        .filter((record) => matchesFilter(record, filters))
        .slice(-10)
        .reverse() ?? [],
    [summary, filters],
  );
  const recentTransactions = useMemo(
    () =>
      summary?.transactions
        .filter((record) => record.date && record.type && record.amount > 0)
        .filter((record) => matchesFilter(record, filters))
        .slice(-8)
        .reverse() ?? [],
    [summary, filters],
  );
  const recentAppRecords = useMemo(() => summary?.appRecords.filter((record) => matchesFilter(record, filters)).slice(-6).reverse() ?? [], [summary, filters]);
  const deletedRecords = useMemo(() => summary?.deletedRecords.slice(-30).reverse() ?? [], [summary]);
  const kaplanOpenReceivables = useMemo(
    () =>
      summary?.receivables
        .filter((record) => record.amount > 0 && record.status !== 'Tahsil Edildi' && record.job.includes('Kaplan Teknik'))
        .filter((record) => matchesFilter(record, filters))
        .slice(0, 10)
        .reverse() ?? [],
    [summary, filters],
  );
  const customerNames = useMemo(() => {
    const names = new Set<string>();
    summary?.receivables.forEach((record) => record.customer && names.add(record.customer));
    summary?.appRecords.forEach((record) => record.customer && record.customer !== 'Genel' && names.add(record.customer));

    return [...names].sort((left, right) => left.localeCompare(right, 'tr-TR'));
  }, [summary]);

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

  useEffect(() => {
    async function notifyOpenReceivables() {
      const open = summary?.receivables.filter((record) => record.amount > 0 && record.status !== 'Tahsil Edildi') ?? [];

      if (open.length === 0) return;

      const today = todayInput();
      const lastNotification = await SecureStore.getItemAsync(NOTIFY_DATE_KEY);

      if (lastNotification === today) return;

      const permission = await Notifications.requestPermissionsAsync();

      if (!permission.granted) return;

      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Açık tahsilat var',
          body: `${open.length} açık tahsilat, toplam ${currency(open.reduce((sum, record) => sum + record.amount, 0))}`,
        },
        trigger: null,
      });
      await SecureStore.setItemAsync(NOTIFY_DATE_KEY, today);
    }

    notifyOpenReceivables().catch(() => undefined);
  }, [summary]);

  useEffect(() => {
    async function loadLocalAuth() {
      const [storedPin, remembered, rememberedEmployee, hasHardware, enrolled] = await Promise.all([
        SecureStore.getItemAsync(LOCAL_PIN_KEY),
        SecureStore.getItemAsync(REMEMBER_PIN_KEY),
        SecureStore.getItemAsync(REMEMBER_EMPLOYEE_KEY),
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
      ]);
      const employee = EMPLOYEES.includes(rememberedEmployee as EmployeeName) ? (rememberedEmployee as EmployeeName) : 'Durukan';

      setSavedPin(storedPin);
      setCreatingPin(!storedPin);
      setRememberPin(remembered === 'true');
      setLoginEmployee(employee);
      setBiometricAvailable(Boolean(storedPin && hasHardware && enrolled));

      if (storedPin && remembered === 'true') {
        setPinInput(storedPin);
      }
    }

    loadLocalAuth().catch(() => {
      setCreatingPin(true);
    });
  }, []);

  if (!currentEmployee) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <View style={styles.loginScreen}>
          <View style={styles.loginCard}>
            <Image source={require('./assets/brand-logo.png')} style={styles.loginLogo} resizeMode="contain" />
            <Text style={styles.company}>Kullanıcı</Text>
            <Text style={styles.loginTitle}>Giriş</Text>
            <Segmented
              label="Eleman"
              value={loginEmployee}
              options={EMPLOYEES.map((employee) => [employee, employee]) as [string, string][]}
              onChange={(value) => setLoginEmployee(value as EmployeeName)}
            />
            {creatingPin ? (
              <>
                <Input label="Yeni PIN" value={newPin} onChangeText={setNewPin} placeholder="En az 4 hane" keyboardType="number-pad" />
                <Input label="PIN Tekrar" value={confirmPin} onChangeText={setConfirmPin} placeholder="Tekrar gir" keyboardType="number-pad" />
                <Pressable style={styles.primaryButton} onPress={saveLocalPin}>
                  <Text style={styles.primaryButtonText}>PIN Oluştur</Text>
                </Pressable>
                {savedPin ? (
                  <Pressable style={styles.secondaryButtonFull} onPress={() => setCreatingPin(false)}>
                    <Text style={styles.secondaryButtonText}>Girişe Dön</Text>
                  </Pressable>
                ) : null}
              </>
            ) : (
              <>
                <Input label="PIN" value={pinInput} onChangeText={setPinInput} placeholder="PIN" keyboardType="number-pad" />
                <Pressable style={styles.rememberRow} onPress={() => setRememberPin((current) => !current)}>
                  <View style={[styles.checkbox, rememberPin && styles.checkboxActive]} />
                  <Text style={styles.rememberText}>PIN hatırla</Text>
                </Pressable>
                <Pressable style={styles.primaryButton} onPress={login}>
                  <Text style={styles.primaryButtonText}>Giriş Yap</Text>
                </Pressable>
                {biometricAvailable ? (
                  <Pressable style={styles.secondaryButtonFull} onPress={loginWithBiometrics}>
                    <Text style={styles.secondaryButtonText}>Parmak İzi ile Giriş</Text>
                  </Pressable>
                ) : null}
                <Pressable style={styles.secondaryButtonFull} onPress={() => setCreatingPin(true)}>
                  <Text style={styles.secondaryButtonText}>PIN Oluştur / Değiştir</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  function updateForm(key: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateFilters(key: keyof FilterState, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function completeLogin(employee: EmployeeName) {
    setCurrentEmployee(employee);
    setForm((current) => ({ ...current, employee }));
  }

  async function login() {
    if (!savedPin) {
      Alert.alert('PIN gerekli', 'Önce bu cihaz için bir PIN oluştur.');
      setCreatingPin(true);
      return;
    }

    if (pinInput.trim() !== savedPin) {
      Alert.alert('PIN hatalı', 'Lütfen uygulama PIN kodunu kontrol et.');
      return;
    }

    await SecureStore.setItemAsync(REMEMBER_PIN_KEY, rememberPin ? 'true' : 'false');
    await SecureStore.setItemAsync(REMEMBER_EMPLOYEE_KEY, loginEmployee);

    if (!rememberPin) {
      setPinInput('');
    }

    completeLogin(loginEmployee);
  }

  async function saveLocalPin() {
    const pin = newPin.trim();

    if (pin.length < 4) {
      Alert.alert('PIN kısa', 'PIN en az 4 haneli olmalı.');
      return;
    }

    if (pin !== confirmPin.trim()) {
      Alert.alert('PIN eşleşmiyor', 'Yeni PIN ve tekrar alanı aynı olmalı.');
      return;
    }

    await SecureStore.setItemAsync(LOCAL_PIN_KEY, pin);
    await SecureStore.setItemAsync(REMEMBER_EMPLOYEE_KEY, loginEmployee);
    await SecureStore.setItemAsync(REMEMBER_PIN_KEY, rememberPin ? 'true' : 'false');
    setSavedPin(pin);
    setPinInput(rememberPin ? pin : '');
    setNewPin('');
    setConfirmPin('');
    setCreatingPin(false);

    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    setBiometricAvailable(hasHardware && enrolled);
    Alert.alert('PIN oluşturuldu', 'Bu cihaz için giriş PIN’i kaydedildi.');
  }

  async function loginWithBiometrics() {
    if (!savedPin) {
      Alert.alert('PIN gerekli', 'Biyometrik girişten önce PIN oluştur.');
      return;
    }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Muhasebe girişini onayla',
      cancelLabel: 'Vazgeç',
      fallbackLabel: 'PIN kullan',
    });

    if (!result.success) {
      return;
    }

    await SecureStore.setItemAsync(REMEMBER_EMPLOYEE_KEY, loginEmployee);
    completeLogin(loginEmployee);
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
      date: todayInput(),
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
          date: form.date,
          paymentStatus: entryPage === 'income' || entryPage === 'kaplanIncome' ? form.paymentStatus : 'Tahsil Edildi',
          paymentType: form.paymentType,
          employee: currentEmployee ?? form.employee,
          note: [
            kaplan ? 'Kaplan Teknik' : '',
            (entryPage === 'expense' || entryPage === 'kaplanExpense') && form.sharedExpense === 'Evet'
              ? `[ORTAK:${form.expensePayer}|DURUM:Açık]`
              : '',
            photoMarker(form.photoUri),
          ]
            .filter(Boolean)
            .join(' '),
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
      const params = new URLSearchParams({
        type: 'transaction',
        rowNumber: String(record.rowNumber),
        date: record.date,
        recordType: record.type,
        category: record.category,
        description: record.description,
        amount: String(record.amount),
        paymentType: record.paymentType,
      });
      const response = await fetch(`${API_URL}?${params.toString()}`, {
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

  function confirmDeleteReceivable() {
    if (!editingReceivable) return;

    Alert.alert(
      'Tahsilat silinsin mi?',
      `${editingReceivable.customer} kaydı silinecek ve Silinenler sayfasına işlenecek.`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Sil', style: 'destructive', onPress: deleteReceivableEdit },
      ],
    );
  }

  async function deleteReceivableEdit() {
    if (!editingReceivable) return;

    try {
      setSaving(true);
      const response = await fetch(`${API_URL}?type=receivable&rowNumber=${editingReceivable.rowNumber}`, {
        method: 'DELETE',
        headers: requestHeaders,
      });

      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.detail ?? body.error ?? 'Tahsilat silinemedi');
      }

      setEditingReceivable(null);
      await loadSummary();
      Alert.alert('Silindi', 'Tahsilat kaydı silindi ve loglandı.');
    } catch (caught) {
      Alert.alert('Silinemedi', caught instanceof Error ? caught.message : 'Bilinmeyen hata');
    } finally {
      setSaving(false);
    }
  }

  function confirmClosePartnerExpense(record: PartnerExpense) {
    Alert.alert(
      'Ortak gider kapatılsın mı?',
      `${record.description} için ${currency(record.share)} mahsuplaşma kapandı olarak işlenecek.`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Kapat', onPress: () => closePartnerExpense(record) },
      ],
    );
  }

  async function closePartnerExpense(record: PartnerExpense) {
    if (!record.rowNumber) {
      Alert.alert('Satır bulunamadı', 'Bu ortak giderin Google Sheets satırı belirlenemedi.');
      return;
    }

    try {
      setSaving(true);
      const response = await fetch(API_URL, {
        method: 'PATCH',
        headers: requestHeaders,
        body: JSON.stringify({
          action: 'close_partner_expense',
          rowNumber: record.rowNumber,
          date: record.date,
          type: 'Gider',
          description: record.description,
          amount: record.amount,
        }),
      });

      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.detail ?? body.error ?? 'Ortak gider kapatılamadı');
      }

      await loadSummary();
      Alert.alert('Kapatıldı', 'Ortak gider açık listeden kaldırıldı.');
    } catch (caught) {
      Alert.alert('Kapatılamadı', caught instanceof Error ? caught.message : 'Bilinmeyen hata');
    } finally {
      setSaving(false);
    }
  }

  function confirmRestoreDeleted(record: DeletedRecord) {
    Alert.alert(
      'Kayıt geri yüklensin mi?',
      `${record.description || record.customer || record.recordType} yeniden ilgili tabloya eklenecek.`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Geri Yükle', onPress: () => restoreDeleted(record) },
      ],
    );
  }

  async function restoreDeleted(record: DeletedRecord) {
    if (!record.rowNumber) {
      Alert.alert('Satır bulunamadı', 'Silinen kayıt satırı belirlenemedi.');
      return;
    }

    try {
      setSaving(true);
      const response = await fetch(API_URL, {
        method: 'PATCH',
        headers: requestHeaders,
        body: JSON.stringify({
          action: 'restore_deleted',
          deletedRowNumber: record.rowNumber,
        }),
      });

      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.detail ?? body.error ?? 'Kayıt geri yüklenemedi');
      }

      await loadSummary();
      Alert.alert('Geri yüklendi', 'Kayıt ilgili tabloya yeniden eklendi.');
    } catch (caught) {
      Alert.alert('Geri yüklenemedi', caught instanceof Error ? caught.message : 'Bilinmeyen hata');
    } finally {
      setSaving(false);
    }
  }

  async function pickFormPhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert('İzin gerekli', 'Fotoğraf eklemek için galeri izni gerekiyor.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });

    if (result.canceled) return;

    setForm((current) => ({ ...current, photoUri: result.assets[0]?.uri ?? '' }));
  }

  async function createReceiptPdf(record: WorkRecord) {
    try {
      const pdf = await Print.printToFileAsync({ html: receiptHtml(record) });
      const available = await Sharing.isAvailableAsync();

      if (available) {
        await Sharing.shareAsync(pdf.uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Tahsilat makbuzu',
        });
        return;
      }

      Alert.alert('PDF hazır', pdf.uri);
    } catch (caught) {
      Alert.alert('PDF oluşturulamadı', caught instanceof Error ? caught.message : 'Bilinmeyen hata');
    }
  }

  async function createMonthlyReportPdf(month: string, transactions: TransactionRecord[]) {
    try {
      const pdf = await Print.printToFileAsync({ html: monthlyReportHtml(month, transactions) });
      const available = await Sharing.isAvailableAsync();

      if (available) {
        await Sharing.shareAsync(pdf.uri, {
          mimeType: 'application/pdf',
          dialogTitle: `${month} gelir gider raporu`,
        });
        return;
      }

      Alert.alert('PDF hazır', pdf.uri);
    } catch (caught) {
      Alert.alert('PDF oluşturulamadı', caught instanceof Error ? caught.message : 'Bilinmeyen hata');
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
          <View style={styles.heroHeader}>
            <Image source={require('./assets/brand-logo.png')} style={styles.heroLogo} resizeMode="contain" />
            <View>
              <Text style={styles.company}>{currentEmployee}</Text>
              <Text style={styles.title}>Muhasebe</Text>
            </View>
          </View>
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
          <PageTab active={activePage === 'partner'} label="Ortak Hesabı" onPress={() => switchPage('partner')} />
          <PageTab active={activePage === 'customers'} label="Müşteri" onPress={() => switchPage('customers')} />
          <PageTab active={activePage === 'kaplanLedger'} label="Kaplan Cari" onPress={() => switchPage('kaplanLedger')} />
          <PageTab active={activePage === 'deleted'} label="Silinenler" onPress={() => switchPage('deleted')} />
        </View>

        <FilterPanel filters={filters} onChange={updateFilters} onClear={() => setFilters({ query: '', startDate: '', endDate: '' })} />

        {activePage === 'summary' ? (
          <SummaryPage
            summary={summary}
            recentTransactions={recentTransactions}
            recentAppRecords={recentAppRecords}
            collectedReceivables={collectedReceivables}
            onDeleteRecord={deleteRecord}
            reportMonth={monthKey(filters.startDate) || monthKey(todayInput())}
            onCreateMonthlyReport={createMonthlyReportPdf}
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
            onPickPhoto={pickFormPhoto}
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
            onPickPhoto={pickFormPhoto}
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
            onPickPhoto={pickFormPhoto}
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
            onPickPhoto={pickFormPhoto}
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
            onDeleteEdit={confirmDeleteReceivable}
          />
        ) : null}

        {activePage === 'collected' ? (
          <CollectedPage receivables={collectedReceivables} onMarkUncollected={confirmMarkUncollected} onCreateReceipt={createReceiptPdf} />
        ) : null}

        {activePage === 'partner' ? (
          <PartnerPage partner={summary?.partner} saving={saving} onCloseExpense={confirmClosePartnerExpense} />
        ) : null}

        {activePage === 'customers' ? (
          <CustomerPage
            summary={summary}
            customerNames={customerNames}
            selectedCustomer={selectedCustomer}
            onSelectCustomer={setSelectedCustomer}
          />
        ) : null}

        {activePage === 'kaplanLedger' ? (
          <KaplanLedgerPage transactions={summary?.transactions ?? []} receivables={summary?.receivables ?? []} />
        ) : null}

        {activePage === 'deleted' ? (
          <DeletedPage records={deletedRecords} saving={saving} onRestore={confirmRestoreDeleted} />
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
  reportMonth,
  onCreateMonthlyReport,
}: {
  summary: AccountingSummary | null;
  recentTransactions: TransactionRecord[];
  recentAppRecords: AppRecord[];
  collectedReceivables: WorkRecord[];
  onDeleteRecord: (id: string) => void;
  reportMonth: string;
  onCreateMonthlyReport: (month: string, transactions: TransactionRecord[]) => void;
}) {
  const collectedTotal = collectedReceivables.reduce((sum, record) => sum + record.amount, 0);
  const expensesTotal = summary?.totals.expenses ?? 0;
  const netProfit = collectedTotal - expensesTotal;
  const chartTotal = collectedTotal + expensesTotal;
  const incomePercent = percent(collectedTotal, chartTotal);
  const expensePercent = percent(expensesTotal, chartTotal);
  const currentMonth = reportMonth || monthKey(todayInput());
  const monthlyTransactions = summary?.transactions.filter((record) => monthKey(record.date) === currentMonth) ?? [];
  const monthlyIncome =
    monthlyTransactions.filter((record) => record.type === 'Gelir').reduce((sum, record) => sum + record.amount, 0);
  const monthlyExpenses =
    monthlyTransactions.filter((record) => record.type === 'Gider').reduce((sum, record) => sum + record.amount, 0);
  const employeeRows = EMPLOYEES.map((employee) => {
    const records = summary?.appRecords.filter((record) => record.employee === employee) ?? [];

    return {
      employee,
      count: records.length,
      total: records.reduce((sum, record) => sum + record.amount, 0),
    };
  });

  return (
    <>
      <View style={styles.summaryGrid}>
        <Metric label="Net Kar" value={currency(netProfit)} tone="green" />
        <Metric label="Tahsil Edilmeyen" value={currency(summary?.totals.receivables ?? 0)} tone="orange" />
        <Metric label="Gider" value={currency(expensesTotal)} tone="red" />
      </View>

      <View style={styles.chartSection}>
        <View style={styles.chartHeader}>
          <View>
            <Text style={styles.sectionTitleCompact}>Gelir / Gider Dağılımı</Text>
            <Text style={styles.chartSubtitle}>Tahsil edilen gelir ve yapılan gider oranı</Text>
          </View>
          <Text style={[styles.chartNet, netProfit >= 0 ? styles.greenText : styles.redText]}>{currency(netProfit)}</Text>
        </View>
        <View style={styles.chartBody}>
          <FinancePieChart income={collectedTotal} expenses={expensesTotal} />
          <View style={styles.chartLegend}>
            <ChartLegendRow label="Gelir" value={currency(collectedTotal)} percent={incomePercent} tone="green" />
            <ChartLegendRow label="Gider" value={currency(expensesTotal)} percent={expensePercent} tone="red" />
          </View>
        </View>
      </View>

      <View style={styles.summaryGrid}>
        <Metric label="Bu Ay Gelir" value={currency(monthlyIncome)} tone="green" />
        <Metric label="Bu Ay Gider" value={currency(monthlyExpenses)} tone="red" />
        <Metric label="Bu Ay Net" value={currency(monthlyIncome - monthlyExpenses)} tone="blue" />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Aylık Rapor</Text>
        <View style={styles.totalBand}>
          <Text style={styles.totalBandLabel}>{currentMonth} gelir gider raporu</Text>
          <Pressable style={styles.primaryButtonInline} onPress={() => onCreateMonthlyReport(currentMonth, monthlyTransactions)}>
            <Text style={styles.primaryButtonText}>PDF İndir</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Personel Raporu</Text>
        {employeeRows.map((row) => (
          <ListRow
            key={row.employee}
            title={row.employee}
            subtitle={`${row.count} uygulama kaydı`}
            value={currency(row.total)}
            tone={row.employee === 'Durukan' ? 'blue' : 'orange'}
          />
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Son Hareketler</Text>
        {recentTransactions.length === 0 ? <Text style={styles.empty}>Henüz hareket yok.</Text> : null}
        {recentTransactions.map((record, index) => (
          <ListRow
            key={`${record.date}-${record.description}-${record.amount}-${index}`}
            title={stripMarkers(record.description || record.category)}
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
  onPickPhoto,
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
  onPickPhoto: () => void;
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
        onPickPhoto={onPickPhoto}
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
            title={stripMarkers(record.description || record.category)}
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
  onDeleteEdit,
}: {
  receivables: WorkRecord[];
  onMarkCollected: (record: WorkRecord) => void;
  editingReceivable: ReceivableEditState | null;
  saving: boolean;
  onEditReceivable: (record: WorkRecord) => void;
  onCancelEdit: () => void;
  onUpdateEdit: (key: keyof ReceivableEditState, value: string) => void;
  onSaveEdit: () => void;
  onDeleteEdit: () => void;
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
            <Pressable style={styles.dangerButton} onPress={onDeleteEdit} disabled={saving}>
              <Text style={styles.dangerButtonText}>Sil</Text>
            </Pressable>
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
  onCreateReceipt,
}: {
  receivables: WorkRecord[];
  onMarkUncollected: (record: WorkRecord) => void;
  onCreateReceipt: (record: WorkRecord) => void;
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
            onPress={() => onCreateReceipt(record)}
            actionLabel="Geri Aç"
            onAction={() => onMarkUncollected(record)}
          />
        ))}
      </View>
    </>
  );
}

function DeletedPage({
  records,
  saving,
  onRestore,
}: {
  records: DeletedRecord[];
  saving: boolean;
  onRestore: (record: DeletedRecord) => void;
}) {
  const total = records.reduce((sum, record) => sum + record.amount, 0);

  return (
    <>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Silinen Kayıt Toplamı</Text>
        <View style={styles.totalBand}>
          <Text style={styles.totalBandLabel}>Son silinen kayıtların toplamı</Text>
          <Text style={[styles.totalBandValue, styles.redText]}>{currency(total)}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Silinenler</Text>
        {records.length === 0 ? <Text style={styles.empty}>Henüz silinen kayıt yok.</Text> : null}
        {records.map((record, index) => (
          <ListRow
            key={`${record.deletedAt}-${record.source}-${record.rowNumber}-${index}`}
            title={record.description || record.customer || record.recordType}
            subtitle={`${record.deletedAt} · ${record.source} · eski satır ${record.originalRowNumber ?? '-'}`}
            value={currency(record.amount)}
            tone="red"
            actionLabel={saving ? '...' : 'Geri Yükle'}
            onAction={() => onRestore(record)}
          />
        ))}
      </View>
    </>
  );
}

function PartnerPage({
  partner,
  saving,
  onCloseExpense,
}: {
  partner?: PartnerSummary;
  saving: boolean;
  onCloseExpense: (record: PartnerExpense) => void;
}) {
  const openItems = partner?.openItems ?? [];
  const closedItems = partner?.closedItems ?? [];
  const net = partner?.net ?? 0;
  const netText =
    net > 0
      ? `Şirin, Durukan'a ${currency(partner?.partnerOwesYou ?? 0)} ödeyecek`
      : net < 0
        ? `Durukan, Şirin'e ${currency(partner?.youOwePartner ?? 0)} ödeyecek`
        : 'Mahsuplaşma dengede';

  return (
    <>
      <View style={styles.summaryGrid}>
        <Metric label="Şirin -> Durukan" value={currency(partner?.partnerOwesYou ?? 0)} tone="green" />
        <Metric label="Durukan -> Şirin" value={currency(partner?.youOwePartner ?? 0)} tone="red" />
        <Metric label="Net" value={currency(Math.abs(net))} tone="blue" />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Net Mahsuplaşma</Text>
        <View style={styles.totalBand}>
          <Text style={styles.totalBandLabel}>{netText}</Text>
          <Text style={styles.totalBandValue}>{currency(Math.abs(net))}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Açık Ortak Giderler</Text>
        {openItems.length === 0 ? <Text style={styles.empty}>Açık ortak gider yok.</Text> : null}
        {openItems.map((item, index) => (
          <ListRow
            key={`${item.rowNumber}-${item.description}-${index}`}
            title={item.description}
            subtitle={`${item.date} · ödeyen: ${item.payer} · yarısı ${currency(item.share)}`}
            value={currency(item.amount)}
            tone={item.payer === 'Durukan' ? 'green' : 'red'}
            actionLabel={saving ? '...' : 'Kapat'}
            onAction={() => onCloseExpense(item)}
          />
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Kapalı Ortak Giderler</Text>
        {closedItems.length === 0 ? <Text style={styles.empty}>Henüz kapalı ortak gider yok.</Text> : null}
        {closedItems.slice(-12).reverse().map((item, index) => (
          <ListRow
            key={`closed-${item.rowNumber}-${item.description}-${index}`}
            title={item.description}
            subtitle={`${item.date} · ödeyen: ${item.payer} · kapandı`}
            value={currency(item.amount)}
            tone="blue"
          />
        ))}
      </View>
    </>
  );
}

function CustomerPage({
  summary,
  customerNames,
  selectedCustomer,
  onSelectCustomer,
}: {
  summary: AccountingSummary | null;
  customerNames: string[];
  selectedCustomer: string;
  onSelectCustomer: (customer: string) => void;
}) {
  const activeCustomer = selectedCustomer || customerNames[0] || '';
  const receivables = summary?.receivables.filter((record) => record.customer === activeCustomer) ?? [];
  const appRecords = summary?.appRecords.filter((record) => record.customer === activeCustomer) ?? [];
  const openTotal = receivables
    .filter((record) => record.status !== 'Tahsil Edildi')
    .reduce((sum, record) => sum + record.amount, 0);
  const collectedTotal = receivables
    .filter((record) => record.status === 'Tahsil Edildi')
    .reduce((sum, record) => sum + record.amount, 0);

  return (
    <>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Müşteriler</Text>
        {customerNames.length === 0 ? <Text style={styles.empty}>Henüz müşteri kaydı yok.</Text> : null}
        {customerNames.slice(0, 20).map((customer) => (
          <ListRow
            key={customer}
            title={customer}
            subtitle={customer === activeCustomer ? 'seçili müşteri' : 'müşteri kartını aç'}
            value=""
            tone={customer === activeCustomer ? 'blue' : 'orange'}
            onPress={() => onSelectCustomer(customer)}
          />
        ))}
      </View>

      {activeCustomer ? (
        <>
          <View style={styles.summaryGrid}>
            <Metric label="Açık Borç" value={currency(openTotal)} tone="orange" />
            <Metric label="Tahsil Edilen" value={currency(collectedTotal)} tone="green" />
            <Metric label="Kayıt" value={String(appRecords.length + receivables.length)} tone="blue" />
          </View>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{activeCustomer}</Text>
            {[...receivables].reverse().map((record, index) => (
              <ListRow
                key={`${record.rowNumber}-${index}`}
                title={record.job}
                subtitle={`${record.status ?? 'Durum yok'}${record.date ? ` · ${record.date}` : ''}`}
                value={currency(record.amount)}
                tone={record.status === 'Tahsil Edildi' ? 'green' : 'orange'}
              />
            ))}
            {appRecords.slice(-12).reverse().map((record) => (
              <ListRow
                key={record.id}
                title={record.description || record.jobType}
                subtitle={`${record.date} · ${record.employee}${record.note?.includes('[FOTO:') ? ' · foto var' : ''}`}
                value={currency(record.amount)}
                tone="blue"
              />
            ))}
          </View>
        </>
      ) : null}
    </>
  );
}

function KaplanLedgerPage({ transactions, receivables }: { transactions: TransactionRecord[]; receivables: WorkRecord[] }) {
  const kaplanTransactions = transactions.filter((record) => isKaplanRecord(record));
  const kaplanReceivables = receivables.filter((record) => record.job.includes('Kaplan Teknik'));
  const income = kaplanTransactions.filter((record) => record.type === 'Gelir').reduce((sum, record) => sum + record.amount, 0);
  const expenses = kaplanTransactions.filter((record) => record.type === 'Gider').reduce((sum, record) => sum + record.amount, 0);
  const open = kaplanReceivables.filter((record) => record.status !== 'Tahsil Edildi').reduce((sum, record) => sum + record.amount, 0);

  return (
    <>
      <View style={styles.summaryGrid}>
        <Metric label="Kaplan Gelir" value={currency(income)} tone="green" />
        <Metric label="Kaplan Gider" value={currency(expenses)} tone="red" />
        <Metric label="Açık" value={currency(open)} tone="orange" />
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Kaplan Teknik Cari</Text>
        <View style={styles.totalBand}>
          <Text style={styles.totalBandLabel}>Net durum</Text>
          <Text style={styles.totalBandValue}>{currency(income - expenses)}</Text>
        </View>
        {kaplanReceivables.slice(-12).reverse().map((record, index) => (
          <ListRow
            key={`kaplan-rec-${record.rowNumber}-${index}`}
            title={record.customer}
            subtitle={`${record.job} · ${record.status ?? 'Durum yok'}`}
            value={currency(record.amount)}
            tone={record.status === 'Tahsil Edildi' ? 'green' : 'orange'}
          />
        ))}
        {kaplanTransactions.slice(-12).reverse().map((record, index) => (
          <ListRow
            key={`kaplan-tx-${record.rowNumber}-${index}`}
            title={stripMarkers(record.description || record.category)}
            subtitle={`${record.date} · ${record.type} · ${record.paymentType}`}
            value={currency(record.amount)}
            tone={record.type === 'Gider' ? 'red' : 'green'}
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
  onPickPhoto,
}: {
  page: EntryPage;
  config: { title: string; subtitle: string; action: string };
  form: FormState;
  saving: boolean;
  onSubmit: () => void;
  onUpdateForm: (key: keyof FormState, value: string) => void;
  onPickPhoto: () => void;
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

      <Segmented
        label="Eleman"
        value={form.employee}
        options={EMPLOYEES.map((employee) => [employee, employee]) as [string, string][]}
        onChange={(value) => onUpdateForm('employee', value)}
      />
      <Input label="Tarih" value={form.date} onChangeText={(value) => onUpdateForm('date', value)} placeholder="YYYY-AA-GG" />
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
      <Pressable style={styles.secondaryButtonFull} onPress={onPickPhoto}>
        <Text style={styles.secondaryButtonText}>{form.photoUri ? 'Fotoğraf Seçildi' : 'Fotoğraf Ekle'}</Text>
      </Pressable>

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

      {expensePage ? (
        <>
          <Segmented
            label="Ortak Gider"
            value={form.sharedExpense}
            options={[
              ['Hayır', 'Hayır'],
              ['Evet', 'Evet'],
            ]}
            onChange={(value) => onUpdateForm('sharedExpense', value as 'Hayır' | 'Evet')}
          />
          {form.sharedExpense === 'Evet' ? (
            <Segmented
              label="Ödemeyi Yapan"
              value={form.expensePayer}
              options={[
                ['Durukan', 'Durukan'],
                ['Şirin', 'Şirin'],
              ]}
              onChange={(value) => onUpdateForm('expensePayer', value as 'Durukan' | 'Şirin')}
            />
          ) : null}
        </>
      ) : null}

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

function polarToCartesian(center: number, radius: number, angleInDegrees: number) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;

  return {
    x: center + radius * Math.cos(angleInRadians),
    y: center + radius * Math.sin(angleInRadians),
  };
}

function describeArc(center: number, radius: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(center, radius, endAngle);
  const end = polarToCartesian(center, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

  return [`M ${center} ${center}`, `L ${start.x} ${start.y}`, `A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`, 'Z'].join(' ');
}

function FinancePieChart({ income, expenses }: { income: number; expenses: number }) {
  const size = 148;
  const center = size / 2;
  const radius = 66;
  const total = income + expenses;
  const incomeAngle = total > 0 ? (income / total) * 360 : 0;

  if (total <= 0) {
    return (
      <View style={styles.pieWrap}>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <Circle cx={center} cy={center} r={radius} fill="#edf2ef" />
          <Circle cx={center} cy={center} r={38} fill="#ffffff" />
        </Svg>
        <View style={styles.pieCenter}>
          <Text style={styles.piePercent}>0%</Text>
          <Text style={styles.pieLabel}>veri yok</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.pieWrap}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle cx={center} cy={center} r={radius} fill="#c4483c" />
        {incomeAngle >= 359.99 ? (
          <Circle cx={center} cy={center} r={radius} fill="#1f8b54" />
        ) : incomeAngle > 0 ? (
          <Path d={describeArc(center, radius, 0, incomeAngle)} fill="#1f8b54" />
        ) : null}
        <Circle cx={center} cy={center} r={42} fill="#ffffff" />
      </Svg>
      <View style={styles.pieCenter}>
        <Text style={styles.piePercent}>{percent(income, total)}%</Text>
        <Text style={styles.pieLabel}>gelir</Text>
      </View>
    </View>
  );
}

function ChartLegendRow({
  label,
  value,
  percent: ratio,
  tone,
}: {
  label: string;
  value: string;
  percent: number;
  tone: 'green' | 'red';
}) {
  return (
    <View style={styles.legendRow}>
      <View style={[styles.legendDot, styles[`${tone}Dot`]]} />
      <View style={styles.legendText}>
        <Text style={styles.legendLabel}>{label}</Text>
        <Text style={styles.legendValue}>{value}</Text>
      </View>
      <Text style={[styles.legendPercent, styles[`${tone}Text`]]}>{ratio}%</Text>
    </View>
  );
}

function FilterPanel({
  filters,
  onChange,
  onClear,
}: {
  filters: FilterState;
  onChange: (key: keyof FilterState, value: string) => void;
  onClear: () => void;
}) {
  const active = Boolean(filters.query || filters.startDate || filters.endDate);

  return (
    <View style={styles.filterPanel}>
      <View style={styles.filterHeader}>
        <Text style={styles.filterTitle}>Filtre</Text>
        {active ? (
          <Pressable onPress={onClear} hitSlop={8}>
            <Text style={styles.inlineAction}>Temizle</Text>
          </Pressable>
        ) : null}
      </View>
      <Input label="Arama" value={filters.query} onChangeText={(value) => onChange('query', value)} placeholder="Müşteri, açıklama, ödeme türü" />
      <View style={styles.filterDates}>
        <View style={styles.filterDateInput}>
          <Input label="Başlangıç" value={filters.startDate} onChangeText={(value) => onChange('startDate', value)} placeholder="YYYY-AA-GG" />
        </View>
        <View style={styles.filterDateInput}>
          <Input label="Bitiş" value={filters.endDate} onChangeText={(value) => onChange('endDate', value)} placeholder="YYYY-AA-GG" />
        </View>
      </View>
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
    backgroundColor: '#0b1f3a',
  },
  content: {
    padding: 16,
    paddingBottom: 34,
  },
  loginScreen: {
    flex: 1,
    justifyContent: 'center',
    padding: 18,
  },
  loginCard: {
    alignItems: 'stretch',
    backgroundColor: '#102820',
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
  },
  loginLogo: {
    alignSelf: 'center',
    height: 96,
    marginBottom: 14,
    width: 96,
  },
  loginTitle: {
    color: '#ffffff',
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: 0,
    marginBottom: 14,
  },
  hero: {
    backgroundColor: '#0e2a4f',
    borderRadius: 18,
    borderColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    marginBottom: 14,
    overflow: 'hidden',
    padding: 20,
  },
  heroHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
  },
  heroLogo: {
    height: 52,
    width: 52,
  },
  company: {
    color: '#b8d7ff',
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
    marginTop: 20,
  },
  summaryPill: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: 10,
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
    backgroundColor: '#e8eee9',
    borderRadius: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginBottom: 12,
    padding: 5,
  },
  pageTab: {
    alignItems: 'center',
    borderRadius: 9,
    flexGrow: 1,
    flexBasis: '30%',
    minHeight: 42,
    justifyContent: 'center',
  },
  pageTabActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#0c1813',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  pageTabText: {
    color: '#52615b',
    fontSize: 12,
    fontWeight: '900',
  },
  pageTabTextActive: {
    color: '#11231b',
  },
  filterPanel: {
    backgroundColor: '#ffffff',
    borderColor: '#e5ece8',
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
    padding: 14,
  },
  filterHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  filterTitle: {
    color: '#16231d',
    fontSize: 17,
    fontWeight: '900',
  },
  filterDates: {
    flexDirection: 'row',
    gap: 10,
  },
  filterDateInput: {
    flex: 1,
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  metric: {
    backgroundColor: '#ffffff',
    borderColor: '#e7eee9',
    borderRadius: 12,
    borderWidth: 1,
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
    borderColor: '#e5ece8',
    borderRadius: 14,
    borderWidth: 1,
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
    backgroundColor: '#f7faf8',
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
    backgroundColor: '#f7faf8',
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
  secondaryButtonFull: {
    alignItems: 'center',
    backgroundColor: '#eef4f0',
    borderRadius: 12,
    marginTop: 10,
    minHeight: 48,
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: '#52615b',
    fontSize: 15,
    fontWeight: '900',
  },
  rememberRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  checkbox: {
    borderColor: '#9fb2a9',
    borderRadius: 5,
    borderWidth: 2,
    height: 20,
    width: 20,
  },
  checkboxActive: {
    backgroundColor: '#12643d',
    borderColor: '#12643d',
  },
  rememberText: {
    color: '#dbeafe',
    fontSize: 13,
    fontWeight: '900',
  },
  dangerButton: {
    alignItems: 'center',
    backgroundColor: '#ffe8e4',
    borderRadius: 12,
    flex: 1,
    minHeight: 48,
    justifyContent: 'center',
  },
  dangerButtonText: {
    color: '#b33128',
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
    borderColor: '#e5ece8',
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
    overflow: 'hidden',
    paddingTop: 14,
  },
  chartSection: {
    backgroundColor: '#ffffff',
    borderColor: '#e5ece8',
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
    padding: 14,
  },
  chartHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
  },
  sectionTitleCompact: {
    color: '#16231d',
    fontSize: 17,
    fontWeight: '900',
  },
  chartSubtitle: {
    color: '#65736c',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    marginTop: 4,
    maxWidth: 210,
  },
  chartNet: {
    backgroundColor: '#f4f8f5',
    borderRadius: 10,
    fontSize: 13,
    fontWeight: '900',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  chartBody: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 16,
  },
  pieWrap: {
    alignItems: 'center',
    height: 148,
    justifyContent: 'center',
    width: 148,
  },
  pieCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
  },
  piePercent: {
    color: '#16231d',
    fontSize: 25,
    fontWeight: '900',
  },
  pieLabel: {
    color: '#65736c',
    fontSize: 11,
    fontWeight: '900',
    marginTop: 2,
  },
  chartLegend: {
    flex: 1,
    gap: 10,
  },
  legendRow: {
    alignItems: 'center',
    backgroundColor: '#f7faf8',
    borderColor: '#e5ece8',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 58,
    paddingHorizontal: 10,
  },
  legendDot: {
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  legendText: {
    flex: 1,
    minWidth: 0,
  },
  legendLabel: {
    color: '#65736c',
    fontSize: 12,
    fontWeight: '900',
  },
  legendValue: {
    color: '#16231d',
    fontSize: 14,
    fontWeight: '900',
    marginTop: 3,
  },
  legendPercent: {
    fontSize: 15,
    fontWeight: '900',
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
