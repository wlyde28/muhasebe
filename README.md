# Durukan Klima Muhasebe

Bu klasörde iki uygulama var:

- `web`: Next.js yönetim paneli ve Google Sheets API katmanı
- `mobile`: Expo tabanlı React Native mobil uygulaması

Veri kaynağı Google Sheets dosyasıdır:

`Durukan Klima Gelir Gider Takibi`

```text
15kaSfdKd-L1pAQInHCZt9i2Ub-PjrZJFJw1hjusmhiw
```

## Canlı Google Sheets Bağlantısı

`web/.env.example` dosyasını `web/.env.local` olarak kopyalayın ve servis hesabı bilgilerini doldurun.

Google Sheet dosyasını, servis hesabının `GOOGLE_CLIENT_EMAIL` adresiyle paylaşmanız gerekir.

Elemanların uygulamadan kayıt ekleyebilmesi için `APP_SHARED_PIN` değerini belirleyin. Aynı PIN'i `mobile/.env` içindeki `EXPO_PUBLIC_APP_PIN` alanına yazın.

Mobil uygulamadan eklenen kayıtlar önce `App Kayıtları` sekmesine yazılır. Kayıt türüne göre ilgili takip sekmelerine de satır eklenir:

- İş: `Kaplan Teknik` ve `Tahsilat Takibi`
- Tahsilat: `Sheet1` içinde gelir satırı
- Gider: `Sheet1` içinde gider satırı

Uygulamadaki silme işlemi, uygulamadan eklenmiş kaydı `App Kayıtları` sekmesinden kaldırır.

## Çalıştırma

Web/API:

```bash
cd web
npm.cmd run dev
```

Mobil:

```bash
cd mobile
npm.cmd run start
```

Fiziksel telefonda test ederken `mobile/.env` içinde `EXPO_PUBLIC_API_URL` değerini bilgisayarın yerel ağ IP adresine göre ayarlayın. Örnek:

```text
EXPO_PUBLIC_API_URL=http://192.168.1.20:3000/api/records
```
