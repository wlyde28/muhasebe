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

type TabKey = 'income' | 'expense' | 'collection';
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

const tabConfig: Record<TabKey, { title: string; subtitle: string; action: string; recordType: RecordType }> = {
  income: {
    title: 'Gelir',
    subtitle: 'Yeni yapılan işi veya satışı kaydet',
    action: 'Geliri Kaydet',
    recordType: 'job',
  },
  expense: {
    title: 'Gider',
    subtitle: 'Yapılan masrafın açıklamasını ve tutarını gir',
    action: 'Gideri Kaydet',
    recordType: 'expense',
  },
  collection: {
    title: 'Tahsilat',
    subtitle: 'Alınan ödemeyi gelir olarak işle',
    action: 'Tahsilatı Kaydet',
    recordType: 'payment',
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

export default function App() {
  const [summary, setSummary] = useState<AccountingSummary | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('income');
  const [form, setForm] = useState<FormState>(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeConfig = tabConfig[activeTab];
  const openReceivables = useMemo(
    () =>
      summary?.receivables
        .filter((record) => record.customer && record.status !== 'Tahsil Edildi')
        .slice(0, 6) ?? [],
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

  function resetForm() {
    setForm((current) => ({
      ...initialForm,
      employee: current.employee,
      paymentType: current.paymentType,
      category: activeTab === 'expense' ? 'Gider' : activeTab === 'collection' ? 'Tahsilat' : 'Klima Montajı',
    }));
  }

  function switchTab(tab: TabKey) {
    setActiveTab(tab);
    setForm((current) => ({
      ...current,
      category: tab === 'expense' ? 'Gider' : tab === 'collection' ? 'Tahsilat' : 'Klima Montajı',
      paymentStatus: tab === 'income' ? current.paymentStatus : 'Tahsil Edildi',
    }));
  }

  async function submitRecord() {
    const numericAmount = parseAmount(form.amount);

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      Alert.alert('Tutar gerekli', 'Lütfen sıfırdan büyük bir tutar gir.');
      return;
    }

    if (activeTab !== 'expense' && !form.customer.trim()) {
      Alert.alert('Müşteri gerekli', 'Gelir ve tahsilat kayıtlarında müşteri adı gir.');
      return;
    }

    try {
      setSaving(true);
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify({
          recordType: activeConfig.recordType,
          customer: form.customer,
          phone: form.phone,
          jobType: form.category,
          description: form.description,
          amount: numericAmount,
          paymentStatus: activeTab === 'income' ? form.paymentStatus : 'Tahsil Edildi',
          paymentType: form.paymentType,
          employee: form.employee,
        }),
      });

      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.detail ?? body.error ?? 'Kayıt eklenemedi');
      }

      resetForm();
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
            <SummaryPill label="Net" value={currency(summary?.totals.net ?? 0)} />
            <SummaryPill label="Açık" value={currency(summary?.totals.receivables ?? 0)} />
          </View>
        </View>

        {loading && !summary ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color="#ffffff" />
            <Text style={styles.loadingText}>Veriler yükleniyor</Text>
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.summaryGrid}>
          <Metric label="Gelir" value={currency(summary?.totals.income ?? 0)} tone="green" />
          <Metric label="Gider" value={currency(summary?.totals.expenses ?? 0)} tone="red" />
          <Metric label="İşler" value={currency(summary?.totals.jobs ?? 0)} tone="blue" />
        </View>

        <View style={styles.tabs}>
          <TabButton active={activeTab === 'income'} label="Gelir" onPress={() => switchTab('income')} />
          <TabButton active={activeTab === 'expense'} label="Gider" onPress={() => switchTab('expense')} />
          <TabButton active={activeTab === 'collection'} label="Tahsilat" onPress={() => switchTab('collection')} />
        </View>

        <View style={styles.formCard}>
          <View style={styles.formHeader}>
            <View>
              <Text style={styles.formTitle}>{activeConfig.title}</Text>
              <Text style={styles.formSubtitle}>{activeConfig.subtitle}</Text>
            </View>
            <Text style={styles.formBadge}>{form.paymentType}</Text>
          </View>

          <Input label="Eleman" value={form.employee} onChangeText={(value) => updateForm('employee', value)} placeholder="Örn. Ahmet" />
          {activeTab !== 'expense' ? (
            <>
              <Input label="Müşteri" value={form.customer} onChangeText={(value) => updateForm('customer', value)} placeholder="Müşteri adı" />
              <Input label="Telefon" value={form.phone} onChangeText={(value) => updateForm('phone', value)} placeholder="İsteğe bağlı" keyboardType="phone-pad" />
            </>
          ) : null}
          {activeTab !== 'expense' ? (
            <Input
              label="İş / İşlem"
              value={form.category}
              onChangeText={(value) => updateForm('category', value)}
              placeholder="Klima montajı, servis..."
            />
          ) : null}
          <Input
            label={activeTab === 'expense' ? 'Gider Açıklaması' : 'Açıklama'}
            value={form.description}
            onChangeText={(value) => updateForm('description', value)}
            placeholder={activeTab === 'expense' ? 'Örn. yakıt, yemek, malzeme alımı' : 'Kısa açıklama'}
          />
          <Input label="Tutar" value={form.amount} onChangeText={(value) => updateForm('amount', value)} placeholder="0" keyboardType="decimal-pad" />

          <Segmented
            label="Ödeme Türü"
            value={form.paymentType}
            options={[
              ['Nakit', 'Nakit'],
              ['Kart', 'Kart'],
              ['Havale', 'Havale'],
            ]}
            onChange={(value) => updateForm('paymentType', value)}
          />

          {activeTab === 'income' ? (
            <Segmented
              label="Tahsilat Durumu"
              value={form.paymentStatus}
              options={[
                ['Tahsil Edilmedi', 'Açık'],
                ['Tahsil Edildi', 'Ödendi'],
              ]}
              onChange={(value) => updateForm('paymentStatus', value as PaymentStatus)}
            />
          ) : null}

          <Pressable style={[styles.primaryButton, saving && styles.disabled]} onPress={submitRecord} disabled={saving}>
            <Text style={styles.primaryButtonText}>{saving ? 'Kaydediliyor' : activeConfig.action}</Text>
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Açık Tahsilatlar</Text>
          {openReceivables.length === 0 ? <Text style={styles.empty}>Açık tahsilat görünmüyor.</Text> : null}
          {openReceivables.map((record) => (
            <ListRow
              key={`${record.customer}-${record.amount}-${record.job}`}
              title={record.customer}
              subtitle={`${record.job} · dokun, tahsil edildi yap`}
              value={currency(record.amount)}
              tone="orange"
              onPress={() => confirmMarkCollected(record)}
            />
          ))}
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
              <Pressable style={styles.deleteButton} onPress={() => deleteRecord(record.id)} hitSlop={10}>
                <Text style={styles.deleteText}>Sil</Text>
              </Pressable>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
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

function Metric({ label, value, tone }: { label: string; value: string; tone: 'green' | 'red' | 'blue' }) {
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

function TabButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable style={[styles.tab, active && styles.tabActive]} onPress={onPress}>
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
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
}: {
  title: string;
  subtitle: string;
  value: string;
  tone: 'green' | 'red' | 'blue' | 'orange';
  onPress?: () => void;
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
      <Text style={[styles.rowValue, styles[`${tone}Text`]]}>{value}</Text>
    </>
  );

  if (onPress) {
    return (
      <Pressable style={({ pressed }) => [styles.listRow, pressed && styles.rowPressed]} onPress={onPress}>
        {content}
      </Pressable>
    );
  }

  return (
    <View style={styles.listRow}>
      {content}
    </View>
  );
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
  tabs: {
    backgroundColor: '#dfeae4',
    borderRadius: 14,
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
    padding: 5,
  },
  tab: {
    alignItems: 'center',
    borderRadius: 10,
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
  },
  tabActive: {
    backgroundColor: '#ffffff',
  },
  tabText: {
    color: '#52615b',
    fontWeight: '900',
  },
  tabTextActive: {
    color: '#11231b',
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
