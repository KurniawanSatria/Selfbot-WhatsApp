# Dokumentasi Module

Dokumentasi ini mencakup: `sendStickerPack`, `bindWrapper`, `Button`, `ButtonV2`, `Carousel`, `AIRich`, dan `Toolkit`.

Semua fitur ini dibangun di atas library **Baileys** (`sock` = instance socket Baileys/WhatsApp Web).

---

## Daftar Isi

- [sendStickerPack](#sendstickerpack)
- [bindWrapper](#bindwrapper)
- [Button](#button)
- [ButtonV2](#buttonv2)
- [Carousel](#carousel)
- [AIRich](#airich)
- [Toolkit](#toolkit)

---

## `sendStickerPack`

Mengirim **sticker pack** (kumpulan stiker WebP) ke suatu JID, lengkap dengan cover/tray icon, upload terenkripsi ke server WA, dan pembuatan file ZIP stiker secara manual (tanpa dependency zip eksternal).

### Signature

```js
async function sendStickerPack(sock, jid, data = {}, options = {})
```

### Parameter `data`

| Field         | Tipe                                             | Wajib | Keterangan                                                                                    |
| ------------- | ------------------------------------------------ | ----- | --------------------------------------------------------------------------------------------- |
| `cover`       | `Buffer \| string \| { data }`                   | ✅    | Gambar cover/tray icon sticker pack                                                           |
| `stickers`    | `Array<Buffer\|string\|{data,url,path,sticker}>` | ✅    | Daftar sticker (akan otomatis dikonversi ke WebP)                                             |
| `name`        | `string`                                         | ❌    | Nama pack (default: `"Sticker Pack"`)                                                         |
| `publisher`   | `string`                                         | ❌    | Nama publisher (default: `"Unknown"`)                                                         |
| `description` | `string`                                         | ❌    | Deskripsi pack                                                                                |
| `emojis`      | `string[]`                                       | ❌    | Emoji default untuk tiap stiker (default: `["🎨"]`)                                           |
| `origin`      | `string`                                         | ❌    | `"USER_CREATED"` (default) — sesuai enum `proto.Message.StickerPackMessage.StickerPackOrigin` |

Setiap item pada `stickers` juga bisa berupa object dengan:

- `emojis`: emoji khusus untuk stiker tersebut
- `accessibilityLabel` / `label`: label aksesibilitas

### Parameter `options`

| Field       | Keterangan                               |
| ----------- | ---------------------------------------- |
| `packId`    | ID pack custom (default: auto-generate)  |
| `quoted`    | Pesan yang di-reply (`{ key, message }`) |
| `messageId` | ID pesan custom saat relay               |

### Contoh

```js
await sock.sendStickerPack(jid, {
  name: "Pack Lucu",
  publisher: "Fearless Bot",
  cover: "./cover.png",
  stickers: [
    { data: "./stiker1.png", emojis: ["😂"] },
    { data: "./stiker2.webp" },
    "https://contoh.com/stiker3.png",
  ],
});
```

> Catatan: fungsi ini otomatis mengonversi gambar non-WebP ke WebP via `ffmpeg`, menghitung `crc32`, membangun ZIP secara manual (`storeZip`), mengenkripsi payload dengan AES-256-CBC + HMAC-SHA256 (skema media WhatsApp), lalu mengupload via `sock.waUploadToServer`.

---

## `bindWrapper`

Fungsi utama yang **menambahkan (bind) berbagai method custom** ke instance `sock` Baileys. Wajib dipanggil sekali setelah socket dibuat agar method-method seperti `sock.sendButton`, `sock.sendWithThumbnail`, `sock.sendAiRich`, dan `sock.sendStickerPack` tersedia.

### Signature

```js
function bindWrapper(sock)
```

### Yang dilakukan

1. Memanggil `bindButton(sock)` → menambahkan `sock.sendButton`.
2. Memanggil `patchMessageId(sock)` → patch generator ID pesan.
3. Menambahkan `sock.sendWithThumbnail(jid, data, quoted, options)` → mengirim teks dengan link preview/thumbnail custom (mirip kirim link WA dengan preview besar).
4. Menambahkan `sock.sendAiRich(jid, data, options)` → mengirim pesan "rich response" bergaya AI (teks, kode, tabel, gambar, video, reels, produk, post, saran, dsb).
5. Menambahkan `sock.sendStickerPack` (wrapper dari fungsi `sendStickerPack`).

### Contoh

```js
const { bindWrapper } = require("./lib");

const sock = makeWASocket({ ... });
bindWrapper(sock);

// setelah ini tersedia:
await sock.sendButton(jid, { body: "Halo", buttons: [...] });
await sock.sendWithThumbnail(jid, { text: "Cek ini", thumbnailUrl: "https://..." });
await sock.sendAiRich(jid, { submessages: [{ type: "text", text: "Hasil AI" }] });
await sock.sendStickerPack(jid, { cover, stickers });
```

### `sock.sendButton(jid, content, options)`

Method serbaguna untuk mengirim **interactive message**: tombol biasa, lokasi, carousel card, atau native flow (list, url, call, copy, reply, flow).

Mendukung struktur `content`:

- `content.buttons`: array tombol sederhana `{ type, text, ... }` (`url`, `copy`, `call`, `list`, `flow`, `reply`)
- `content.location`: mengirim pesan lokasi dengan tombol
- `content.cards`: array card untuk carousel
- `content.header/body/footer`: string atau object terstruktur
- `content.ai: true`: menandai pesan sebagai berasal dari bot AI (menambahkan node `bot`)

### `sock.sendWithThumbnail(jid, data, quoted, options)`

Mengirim pesan teks dengan **link preview kustom** (title, deskripsi, thumbnail besar, favicon), termasuk auto-deteksi mention (`@62812...` atau JID lengkap dalam teks).

### `sock.sendAiRich(jid, data, options)`

Mengirim pesan format **rich response ala chatbot AI**, mendukung banyak tipe submessage: `text`, `code`, `table`, `image`/`grid`, `video`, `reels`, `tip`, `suggest`, `source`, `product`, `post`.

---

## `Button`

Class **builder pattern** untuk membangun dan mengirim _interactive message_ (native flow) dengan API method-chaining.

### Constructor

```js
new Button(sock);
```

### Method Setter (dari `BaseBuilder`)

| Method                   | Keterangan                                           |
| ------------------------ | ---------------------------------------------------- |
| `.setTitle(title)`       | Judul header                                         |
| `.setSubtitle(subtitle)` | Subjudul header                                      |
| `.setBody(body)`         | Isi teks pesan                                       |
| `.setFooter(footer)`     | Footer                                               |
| `.setContextInfo(obj)`   | Context info kustom (mis. quoted, mention)           |
| `.addPayload(obj)`       | Tambahan payload mentah yang digabung ke pesan akhir |

### Method Media

| Method                        | Keterangan              |
| ----------------------------- | ----------------------- |
| `.setVideo(path, options)`    | Set video di header     |
| `.setImage(path, options)`    | Set gambar di header    |
| `.setDocument(path, options)` | Set dokumen di header   |
| `.setMedia(obj)`              | Set media mentah kustom |

### Method Tombol

| Method                                            | Keterangan                             |
| ------------------------------------------------- | -------------------------------------- |
| `.addButton(name, params)`                        | Tombol native flow generik             |
| `.addReply(text, id, options)`                    | Tombol quick reply                     |
| `.addUrl(text, url, webviewInteraction, options)` | Tombol buka URL                        |
| `.addCopy(text, copyCode, options)`               | Tombol salin teks                      |
| `.addCall(text, id, options)`                     | Tombol telepon                         |
| `.addReminder(text, id, options)`                 | Tombol reminder                        |
| `.addCancelReminder(text, id, options)`           | Tombol batalkan reminder               |
| `.addAddress(text, id, options)`                  | Tombol alamat                          |
| `.addLocation(options)`                           | Tombol kirim lokasi                    |
| `.addSelection(title, options)`                   | Membuat tombol list (single select)    |
| `.makeSection(title, highlightLabel)`             | Menambah section pada list aktif       |
| `.makeRow(header, title, description, id)`        | Menambah baris/item pada section aktif |
| `.setParams(obj)`                                 | `messageParamsJson` kustom             |
| `.clearButtons()`                                 | Menghapus semua tombol                 |

### Method Eksekusi

| Method                 | Keterangan                                                                                      |
| ---------------------- | ----------------------------------------------------------------------------------------------- |
| `.toCard()`            | Menghasilkan object "card" (header/body/footer/nativeFlowMessage) — dipakai internal & carousel |
| `.build(jid, options)` | Membentuk objek pesan WA tanpa mengirim                                                         |
| `.send(jid, options)`  | Membentuk **dan** mengirim pesan via `relayMessage`                                             |

### Contoh

```js
const btn = new Button(sock)
  .setTitle("Menu Utama")
  .setBody("Silakan pilih salah satu opsi di bawah")
  .setFooter("Powered by Fearless")
  .addReply("Halo!", "menu_halo")
  .addUrl("Kunjungi Website", "https://example.com")
  .addSelection("Lihat Daftar")
  .makeSection("Kategori A")
  .makeRow("", "Item 1", "Deskripsi item 1", "item_1");

await btn.send(jid);
```

---

## `ButtonV2`

Varian builder untuk **legacy buttons message** (`buttonsMessage`, headerType 6 / lokasi), digunakan saat perlu tombol klasik (bukan native flow interaktif penuh).

### Constructor

```js
new ButtonV2(sock);
```

### Method

| Method                                                                   | Keterangan                                          |
| ------------------------------------------------------------------------ | --------------------------------------------------- |
| `.setTitle/.setSubtitle/.setBody/.setFooter/.setContextInfo/.addPayload` | Sama seperti `BaseBuilder`                          |
| `.setThumbnail(path)`                                                    | Thumbnail (URL/buffer) — otomatis di-resize 300x300 |
| `.setMedia(obj)`                                                         | Override konten header secara mentah                |
| `.addButton(displayText, buttonId)`                                      | Tombol reply sederhana                              |
| `.addRawButton(obj)`                                                     | Tombol dalam format mentah Baileys                  |
| `.build(jid, options)`                                                   | Membentuk objek pesan                               |
| `.send(jid, options)`                                                    | Mengirim pesan (butuh minimal 1 tombol)             |

### Contoh

```js
const btn2 = new ButtonV2(sock)
  .setTitle("Konfirmasi")
  .setBody("Apakah Anda yakin?")
  .setFooter("Pilih salah satu")
  .addButton("Ya", "confirm_yes")
  .addButton("Tidak", "confirm_no");

await btn2.send(jid);
```

---

## `Carousel`

Builder untuk mengirim **carousel message** — beberapa card (masing-masing berisi gambar/video + tombol) yang bisa digeser horizontal.

### Constructor

```js
new Carousel(sock);
```

### Method

| Method                                                      | Keterangan                                                                                                                         |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `.setTitle/.setBody/.setFooter/.setContextInfo/.addPayload` | Sama seperti `BaseBuilder`                                                                                                         |
| `.addCard(card \| card[])`                                  | Menambah satu atau beberapa card. **Setiap card wajib punya `header.hasMediaAttachment = true`** (biasanya dari `Button#toCard()`) |
| `.build(jid, options)`                                      | Membentuk objek pesan carousel                                                                                                     |
| `.send(jid, options)`                                       | Mengirim carousel                                                                                                                  |

### Contoh (menggabungkan dengan `Button`)

```js
const card1 = await new Button(sock)
  .setTitle("Produk A")
  .setBody("Deskripsi produk A")
  .setImage("./produk_a.jpg")
  .addReply("Beli", "buy_a")
  .toCard();

const card2 = await new Button(sock)
  .setTitle("Produk B")
  .setBody("Deskripsi produk B")
  .setImage("./produk_b.jpg")
  .addReply("Beli", "buy_b")
  .toCard();

const carousel = new Carousel(sock)
  .setBody("Pilih produk favoritmu")
  .addCard([card1, card2]);

await carousel.send(jid);
```

---

## `AIRich`

Builder lengkap untuk membuat **pesan "rich response" bergaya AI/chatbot** (mirip UI Meta AI) — mendukung teks markdown, blok kode dengan syntax highlight sederhana, tabel, gambar, video, reels, produk, post sosial media, tip, dan saran pertanyaan lanjutan (suggested prompts).

### Constructor

```js
new AIRich(sock);
```

### Method Konten

| Method                                     | Keterangan                                                                                                                 |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `.addText(text, opts)`                     | Menambah blok teks (mendukung markdown link, sitasi `[](url)`, dan LaTeX via `extractIE`)                                  |
| `.addCode(language, code)`                 | Menambah blok kode dengan tokenizer/syntax highlight bawaan (js, ts, python, java, go, c, cpp, php, rust, html, bash, dll) |
| `.addTable(table, opts)`                   | Menambah tabel dari array 2D string, baris pertama = header                                                                |
| `.addImage(imageUrl, opts)`                | Menambah gambar (string, buffer, atau array)                                                                               |
| `.addVideo(videoUrl, opts)`                | Menambah video; `autoFill: true` (default) otomatis menghitung durasi & thumbnail dari buffer video                        |
| `.addReels(reelsItems)`                    | Menambah carousel horizontal ala reels (video pendek)                                                                      |
| `.addProduct(data)`                        | Menambah kartu produk (single atau array)                                                                                  |
| `.addPost(data)`                           | Menambah kartu post sosial media (single atau array/carousel)                                                              |
| `.addSource(sources)`                      | Menambah daftar sumber referensi (favicon, judul, URL)                                                                     |
| `.addTip(text)`                            | Menambah teks tip/catatan kecil                                                                                            |
| `.addSuggest(suggestion, opts)`            | Menambah tombol saran prompt lanjutan                                                                                      |
| `.addSubmessage(obj)` / `.addSection(obj)` | Menambah submessage/section mentah secara manual                                                                           |

### Method Meta

| Method                 | Keterangan                                                 |
| ---------------------- | ---------------------------------------------------------- |
| `.setTitle(title)`     | Digunakan sebagai `messageDisclaimerText` (disclaimer bot) |
| `.setFooter(footer)`   | Ditambahkan sebagai section teks terakhir                  |
| `.setContextInfo(obj)` | Context info tambahan                                      |
| `.addPayload(obj)`     | Payload tambahan mentah                                    |

### Method Eksekusi

| Method                | Keterangan                                                               |
| --------------------- | ------------------------------------------------------------------------ |
| `.build(options)`     | Menghasilkan object pesan lengkap (`botForwardedMessage`) tanpa mengirim |
| `.send(jid, options)` | Build lalu kirim via `relayMessage`                                      |

`options` pada `.build()`/`.send()`:

- `forwarded` (default `true`): tandai pesan sebagai forwarded dari bot
- `notification` (default `false`): tambahkan metadata transparansi sesi
- `includesUnifiedResponse` / `includesSubmessages` (default `true`): kontrol apakah data unified/submessages disertakan
- `quoted`, `quotedParticipant`: untuk reply pesan

### Contoh

```js
const rich = new AIRich(sock)
  .setTitle("Dibuat oleh AI, bisa saja salah")
  .addText("Berikut penjelasan mengenai **rekursi** dalam pemrograman.")
  .addCode(
    "javascript",
    "function factorial(n) {\n  return n <= 1 ? 1 : n * factorial(n - 1);\n}",
  )
  .addTable([
    ["Bahasa", "Tipe"],
    ["JavaScript", "Dynamic"],
    ["Rust", "Static"],
  ])
  .addSuggest(["Jelaskan lebih detail", "Beri contoh lain"]);

await rich.send(jid);
```

---

## `Toolkit`

Kumpulan **static utility function** untuk manipulasi media (resize, konversi buffer/URL, ambil durasi & thumbnail video MP4) yang dipakai internal oleh `Button`, `AIRich`, dsb — bisa juga dipakai langsung.

### Method Static

| Method                                               | Keterangan                                                                                                                        |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `Toolkit.extractIE(text, opts)`                      | Parsing markdown kustom `[teks](url)` (hyperlink), `[](url)` (citation), `[latex\|w\|h\|...](url)` (LaTeX) menjadi entitas inline |
| `Toolkit.resize(buffer, x, y, fit)`                  | Resize gambar via **sharp**, output PNG dengan background transparan                                                              |
| `Toolkit.waitAllPromises(input)`                     | Resolve semua Promise secara rekursif di dalam object/array (deep-await)                                                          |
| `Toolkit.fetchBuffer(url, options, { silent })`      | Fetch URL → `Buffer`; jika `silent: true` (default) error menghasilkan buffer kosong, bukan throw                                 |
| `Toolkit.toUrl(sock, path, mediaType)`               | Upload buffer/URL ke server WA (`waUploadToServer`) dan mengembalikan URL medianya                                                |
| `Toolkit.resolveMedia(sock, media, mediaType, opts)` | Resolusi fleksibel: URL/base64/buffer → (url \| buffer \| base64), dengan opsi resize dan mendukung array                         |
| `Toolkit.getMp4Duration(buffer, { silent })`         | Membaca atom `moov/mvhd` MP4 secara manual untuk mendapatkan durasi (detik), tanpa ffprobe                                        |
| `Toolkit.getMp4Preview(videoBuffer, opts)`           | Mengambil 1 frame dari video via `ffmpeg` (spawn langsung, tanpa file temp) sebagai thumbnail, opsional resize                    |

### Contoh

```js
// Resize gambar
const resized = await Toolkit.resize(buffer, 512, 512);

// Ambil durasi & thumbnail video
const duration = Toolkit.getMp4Duration(videoBuffer);
const thumb = await Toolkit.getMp4Preview(videoBuffer, { time: duration / 2 });

// Resolusi media fleksibel jadi URL WA
const url = await Toolkit.resolveMedia(
  sock,
  "https://contoh.com/gambar.jpg",
  "image",
  {
    resolveUrl: true,
    result: "url",
  },
);
```

---

## Ketergantungan (Dependencies)

- [`baileys`](https://github.com/WhiskeySockets/Baileys) — inti komunikasi WhatsApp
- `fluent-ffmpeg` + `ffmpeg-static` (atau `ffmpeg` sistem) — konversi audio/video/gambar
- `sharp` (opsional) — dipakai oleh `Toolkit.resize`; jika tidak terpasang, method ini akan error saat dipanggil
- `file-type` (dynamic import) — deteksi tipe file dari buffer
- `axios` — HTTP request untuk `getBuffer`/`fetchJson`
- Modul Node bawaan: `fs`, `path`, `os`, `crypto`, `child_process`, `stream`

## Catatan Umum

- Semua class builder (`Button`, `ButtonV2`, `Carousel`, `AIRich`) mengikuti pola **method chaining**: setiap setter mengembalikan `this`.
- Panggil `bindWrapper(sock)` sekali di awal (setelah socket berhasil connect) agar `sock.sendButton`, `sock.sendWithThumbnail`, `sock.sendAiRich`, dan `sock.sendStickerPack` tersedia.
- Fungsi yang berinteraksi dengan file media selalu membersihkan file temporer (`fs.unlink`) setelah selesai, termasuk pada jalur error (`.catch(() => {})`).
