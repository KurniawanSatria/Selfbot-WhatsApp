# Allowed Manager - Dokumentasi

## 📋 Deskripsi

Fitur **Allowed Manager** memungkinkan Anda mengelola nomor dan chat yang diizinkan untuk menggunakan bot. Semua data disimpan menggunakan **lowdb** (JSON database).

## 🎯 Fitur Utama

### 1. **Manajemen Nomor**
- Tambah/hapus nomor yang diizinkan
- Lihat daftar nomor yang diizinkan
- Nomor diizinkan bisa menggunakan semua fitur bot

### 2. **Manajemen Chat**
- Load semua chat dari store (termasuk grup)
- Enable/disable chat individual atau grup
- Toggle status dengan button list interaktif
- Auto-add chat saat ada pesan baru

### 3. **Settings**
- Konfigurasi auto-allow untuk groups
- Konfigurasi auto-allow untuk contacts

## 📖 Cara Penggunaan

### Command List

```
/allowed help          - Tampilkan menu bantuan
/allowed numbers       - Lihat semua nomor yang diizinkan
/allowed add <number>  - Tambah nomor (contoh: /allowed add 628123456789)
/allowed remove <number> - Hapus nomor

/allowed chats         - Lihat semua chat (groups + individual)
/allowed groups        - Lihat chat group saja
/allowed refresh       - Reload semua chat dari store

/allowed settings      - Lihat pengaturan
/allowed settings <key> <value> - Update setting

/allowed toggle <chatId> <enable|disable> - Toggle chat status
```

### Button List Interface

Saat menggunakan `/allowed chats` atau `/allowed groups`, Anda akan melihat **button list** interaktif:

```
━━ ALL CHATS ━━

Total: 15

🟢 = Enabled
🔴 = Disabled

_Select a chat to toggle_

[Select Action]
├─ Group Chats
│  ├─ 🟢 1. Group Keluarga
│  ├─ 🔴 2. Group Kerja
│  └─ 🟢 3. Group Friends
└─ Individual Chats
   ├─ 🟢 1. +628123456789
   └─ 🔴 2. +628987654321
```

Klik pada chat untuk **toggle** status enable/disable.

## 💾 Database Structure

Data disimpan di `data/allowed.json`:

```json
{
  "allowedNumbers": [
    "628123456789",
    "628987654321"
  ],
  "allowedChats": [
    {
      "chatId": "120363xxx@g.us",
      "chatName": "Group Keluarga",
      "chatType": "group",
      "enabled": true,
      "addedAt": "2026-04-17T10:00:00.000Z"
    },
    {
      "chatId": "628123456789@s.whatsapp.net",
      "chatName": "",
      "chatType": "individual",
      "enabled": false,
      "addedAt": "2026-04-17T10:00:00.000Z"
    }
  ],
  "settings": {
    "autoAllowGroups": false,
    "autoAllowContacts": false
  }
}
```

## 🔧 Authorization Flow

Bot mengecek authorization dengan urutan:

1. **Config** - Cek `AUTHORIZED_NUMBERS` di `config.js`
2. **Database** - Cek di `allowedNumbers` di database
3. **Chat Allowed** - Cek apakah chat (group) di-enable di database

```
User mengirim pesan
    ↓
Apakah dari config AUTHORIZED_NUMBERS? → YA → Izinkan
    ↓ NO
Apakah dari bot sendiri (fromMe)? → YA → Izinkan
    ↓ NO
Apakah nomor ada di database? → YA → Izinkan
    ↓ NO
Apakah chat (group) enabled? → YA → Izinkan
    ↓ NO
BLOKIR
```

## 🚀 Quick Start

1. **Install dependencies** (sudah otomatis):
```bash
npm install lowdb@^2.1.0
```

2. **Start bot**:
```bash
npm start
```

3. **Load semua chat**:
```
/allowed refresh
```

4. **Enable chat yang diinginkan**:
```
/allowed chats
```
Klik chat untuk enable/disable.

5. **Tambah nomor manual** (opsional):
```
/allowed add 628123456789
```

## ⚙️ Settings

Update settings dengan command:

```
/allowed settings autoAllowGroups true
/allowed settings autoAllowContacts false
```

Available settings:
- `autoAllowGroups` - Auto allow semua grup (default: false)
- `autoAllowContacts` - Auto allow semua kontak (default: false)

## 📁 File Structure

```
Selfbot WhatsApp/
├── data/
│   └── allowed.json         # Database file
├── lib/
│   └── database.js          # Database module
├── commands/
│   └── allowed.js           # Allowed manager command
├── events/
│   └── message.upsert.js    # Message handler (updated)
└── docs/
    └── ALLOWED_MANAGER.md   # This file
```

## 🔍 Troubleshooting

### Database tidak terinitialize
```
Error: Database not initialized
```
**Solusi**: Restart bot, pastikan folder `data/` ada.

### Chat tidak muncul di list
**Solusi**: Jalankan `/allowed refresh` untuk load ulang dari store.

### Button tidak berfungsi
**Solusi**: Pastikan menggunakan WhatsApp terbaru yang support interactive messages.

## 📝 Notes

- Database auto-create saat pertama kali bot dijalankan
- Semua chat di-load dengan status **disabled** by default
- Enable chat secara manual untuk keamanan
- Backup `data/allowed.json` secara berkala
