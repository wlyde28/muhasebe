import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type RecordType = 'job' | 'expense' | 'payment';
type PaymentStatus = 'Tahsil Edilmedi' | 'Tahsil Edildi';

type WorkRecord = {
  customer: string;
  job: string;
  amount: number;
  date?: string;
  status?: string;
};

type AppRecord = {
  id: string;
  date: string;
  customer: string;
  jobType: string;
  description: string;
  amount: number;
  paymentStatus: string;
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
  appRecords: AppRecord[];
};

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/api/records';
const APP_PIN = process.env.EXPO_PUBLIC_APP_PIN ?? '';

const headers = {
  'Content-Type': 'application/json',
  ...(APP_PIN ? { 'x-app-pin': APP_PIN } : {}),
};

function currency(amount: number) {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function App() {
  const [summary, setSummary] = useState<AccountingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recordType, setRecordType] = useState<RecordType>('job');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('Tahsil Edilmedi');
  const [customer, setCustomer] = useState('');
  const [phone, setPhone] = useState('');
  const [jobType, setJobType] = useState('Klima Montajı');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentType, setPaymentType] = useState('Nakit');
  const [employee, setEmployee] = useState('');

  const openReceivables = useMemo(
    () => summary?.receivables.filter((record) => record.status !== 'Tahsil Edildi').slice(0, 6) ?? [],
    [summary],
  );
  const recentAppRecords = useMemo(() => summary?.appRecords.slice(-8).reverse() ?? [], [summary]);

  const loadSummary = useCallback(async () => {
    try {
      setError(null);
      const response = await fetch(API_URL);

      if (!response.ok) {
        throw new Error('Veriler alınamadı');
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

  async function submitRecord() {
    const numericAmount = Number(amount.replace(',', '.'));

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      Alert.alert('Tutar gerekli', 'Lütfen sıfırdan büyük bir tutar gir.');
      return;
    }

    try {
      setSaving(true);
      const response = await fetch(API_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          recordType,
          customer,
          phone,
          jobType,
          description,
          amount: numericAmount,
          paymentStatus,
          paymentType,
          employee,
        }),
      });

      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.detail ?? body.error ?? 'Kayıt eklenemedi');
      }

      setCustomer('');
      setPhone('');
      setDescription('');
      setAmount('');
      await loadSummary();
      Alert.alert('Kaydedildi', 'Kayıt Google Sheet tablosuna gönderildi.');
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
        headers,
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadSummary} />}
      >
        <View style={styles.header}>
          <Text style={styles.kicker}>Durukan Klima</Text>
          <Text style={styles.title}>Saha muhasebesi</Text>
          <Text style={styles.subtitle}>İş, gider ve tahsilat kayıtları Google Sheets tablosuna işlenir.</Text>
        </View>

        {loading && !summary ? (
          <View style={styles.center}>
            <ActivityIndicator color="#12643d" />
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {summary ? (
          <>
            {!summary.configured ? (
              <Text style={styles.notice}>
                Canlı yazma için web/.env.local servis hesabı bilgileri girilmeli. Şu an örnek veriler gösteriliyor.
              </Text>
            ) : null}

            <View style={styles.metrics}>
              <Metric label="İş Toplamı" value={currency(summary.totals.jobs)} />
              <Metric label="Tahsil Edilecek" value={currency(summary.totals.receivables)} />
              <Metric label="Gelir" value={currency(summary.totals.income)} />
              <Metric label="Gider" value={currency(summary.totals.expenses)} />
            </View>

            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Yeni Kayıt</Text>
              <Segmented
                value={recordType}
                options={[
                  ['job', 'İş'],
                  ['payment', 'Tahsilat'],
                  ['expense', 'Gider'],
                ]}
                onChange={(value) => setRecordType(value as RecordType)}
              />
              <Input label="Eleman" value={employee} onChangeText={setEmployee} placeholder="Örn. Ahmet" />
              <Input label="Müşteri" value={customer} onChangeText={setCustomer} placeholder="Müşteri adı" />
              <Input label="Telefon" value={phone} onChangeText={setPhone} placeholder="İsteğe bağlı" keyboardType="phone-pad" />
              <Input label="İş / Kategori" value={jobType} onChangeText={setJobType} placeholder="Klima montajı, yakıt..." />
              <Input label="Açıklama" value={description} onChangeText={setDescription} placeholder="Kısa açıklama" />
              <Input label="Tutar" value={amount} onChangeText={setAmount} placeholder="0" keyboardType="decimal-pad" />
              <Segmented
                value={paymentType}
                options={[
                  ['Nakit', 'Nakit'],
                  ['Kart', 'Kart'],
                  ['Havale', 'Havale'],
                ]}
                onChange={setPaymentType}
              />
              {recordType === 'job' ? (
                <Segmented
                  value={paymentStatus}
                  options={[
                    ['Tahsil Edilmedi', 'Açık'],
                    ['Tahsil Edildi', 'Ödendi'],
                  ]}
                  onChange={(value) => setPaymentStatus(value as PaymentStatus)}
                />
              ) : null}
              <Pressable style={[styles.primaryButton, saving && styles.disabled]} onPress={submitRecord} disabled={saving}>
                <Text style={styles.primaryButtonText}>{saving ? 'Kaydediliyor' : 'Kaydet'}</Text>
              </Pressable>
            </View>

            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Son Uygulama Kayıtları</Text>
              {recentAppRecords.length === 0 ? <Text style={styles.empty}>Henüz uygulamadan eklenen kayıt yok.</Text> : null}
              {recentAppRecords.map((record) => (
                <View style={styles.row} key={record.id}>
                  <View style={styles.rowText}>
                    <Text style={styles.customer} numberOfLines={1}>
                      {record.customer}
                    </Text>
                    <Text style={styles.job} numberOfLines={1}>
                      {record.jobType} · {record.employee || 'Saha'} · {record.date}
                    </Text>
                  </View>
                  <View style={styles.rowActions}>
                    <Text style={styles.amount}>{currency(record.amount)}</Text>
                    <Pressable onPress={() => deleteRecord(record.id)} hitSlop={10}>
                      <Text style={styles.deleteText}>Sil</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>

            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Açık Tahsilatlar</Text>
              {openReceivables.map((record) => (
                <View style={styles.row} key={`${record.customer}-${record.amount}`}>
                  <View style={styles.rowText}>
                    <Text style={styles.customer} numberOfLines={1}>
                      {record.customer}
                    </Text>
                    <Text style={styles.job} numberOfLines={1}>
                      {record.job}
                    </Text>
                  </View>
                  <Text style={styles.amount}>{currency(record.amount)}</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function Input(props: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'decimal-pad' | 'phone-pad';
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
        placeholderTextColor="#8c9994"
      />
    </View>
  );
}

function Segmented({
  value,
  options,
  onChange,
}: {
  value: string;
  options: [string, string][];
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map(([optionValue, label]) => (
        <Pressable
          key={optionValue}
          style={[styles.segment, value === optionValue && styles.segmentActive]}
          onPress={() => onChange(optionValue)}
        >
          <Text style={[styles.segmentText, value === optionValue && styles.segmentTextActive]}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f4f8f6',
  },
  content: {
    padding: 18,
    paddingBottom: 32,
  },
  header: {
    marginBottom: 18,
  },
  kicker: {
    color: '#12643d',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 8,
  },
  title: {
    color: '#17211d',
    fontSize: 34,
    fontWeight: '900',
    lineHeight: 38,
  },
  subtitle: {
    color: '#52615b',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
  },
  center: {
    padding: 32,
  },
  error: {
    backgroundColor: '#fdebea',
    borderColor: '#f2c7c2',
    borderRadius: 8,
    borderWidth: 1,
    color: '#8f221b',
    marginBottom: 12,
    padding: 12,
  },
  notice: {
    backgroundColor: '#fff8e8',
    borderColor: '#ead9ab',
    borderRadius: 8,
    borderWidth: 1,
    color: '#5b4713',
    lineHeight: 20,
    marginBottom: 12,
    padding: 12,
  },
  metrics: {
    gap: 10,
    marginBottom: 14,
  },
  metric: {
    backgroundColor: '#ffffff',
    borderColor: '#d9e5df',
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
  },
  metricLabel: {
    color: '#67756f',
    fontSize: 13,
    marginBottom: 6,
  },
  metricValue: {
    color: '#15241e',
    fontSize: 24,
    fontWeight: '900',
  },
  panel: {
    backgroundColor: '#ffffff',
    borderColor: '#d9e5df',
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 14,
    overflow: 'hidden',
  },
  panelTitle: {
    borderBottomColor: '#e5eee9',
    borderBottomWidth: 1,
    color: '#17211d',
    fontSize: 18,
    fontWeight: '900',
    padding: 16,
  },
  segmented: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  segment: {
    alignItems: 'center',
    borderColor: '#cbd9d2',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    minHeight: 42,
    justifyContent: 'center',
  },
  segmentActive: {
    backgroundColor: '#12643d',
    borderColor: '#12643d',
  },
  segmentText: {
    color: '#52615b',
    fontWeight: '800',
  },
  segmentTextActive: {
    color: '#ffffff',
  },
  inputGroup: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  inputLabel: {
    color: '#52615b',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 6,
  },
  input: {
    borderColor: '#cbd9d2',
    borderRadius: 8,
    borderWidth: 1,
    color: '#17211d',
    minHeight: 46,
    paddingHorizontal: 12,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#12643d',
    borderRadius: 8,
    margin: 16,
    minHeight: 48,
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
  },
  empty: {
    color: '#67756f',
    padding: 16,
  },
  row: {
    alignItems: 'center',
    borderBottomColor: '#edf3f0',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 14,
    justifyContent: 'space-between',
    padding: 16,
  },
  rowText: {
    flex: 1,
  },
  rowActions: {
    alignItems: 'flex-end',
    gap: 8,
  },
  customer: {
    color: '#22302b',
    fontSize: 15,
    fontWeight: '800',
  },
  job: {
    color: '#67756f',
    fontSize: 13,
    marginTop: 4,
  },
  amount: {
    color: '#12643d',
    fontSize: 15,
    fontWeight: '900',
  },
  deleteText: {
    color: '#a83224',
    fontSize: 13,
    fontWeight: '900',
  },
});
