# Lüks Oyun Topluluğu Platformu

Bu proje, Express, EJS, SQLite ve Socket.IO kullanılarak geliştirilmiş modern bir topluluk platformudur.

## Özellikler
- **Tam Türkçe Arayüz**: Tüm menüler ve mesajlar Türkçedir.
- **Admin Paneli**: `/admin` sayfası üzerinden kullanıcılar, roller, menüler ve duyurular yönetilebilir.
- **Yetki Sistemi**: Admin, Moderator ve User rolleri (RBAC).
- **Canlı Sohbet**: Socket.IO ile global sohbet odası, mesaj yanıtlama ve silme özellikleri.
- **Menü Yönetimi**: Dış siteleri iframe olarak menüye ekleme imkanı.
- **Modern Tasarım**: Glassmorphism, gece/gündüz modu ve mobil uyumluluk.

## Kurulum
1. `npm install`
2. `npm start`

## Varsayılan Admin Bilgileri
- **Kullanıcı Adı**: `admin`
- **Şifre**: `admin123`

## Route Listesi
- `/`: Ana Sayfa
- `/giris`: Giriş Sayfası
- `/kayit`: Kayıt Ol
- `/chat`: Sohbet
- `/admin`: Admin Paneli
- `/admin/users`: Kullanıcı Yönetimi
- `/admin/announcements`: Duyuru Yönetimi
- `/admin/menu`: Menü Yönetimi
