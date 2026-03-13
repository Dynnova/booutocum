# 🎭 Cosplay Search Bot

Discord bot untuk search cosplay dari galleryepic.xyz dengan SQLite database.

## Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Konfigurasi .env
Copy `.env.example` ke `.env` dan isi:
```bash
cp .env.example .env
```

Isi nilai berikut di `.env`:
- `DISCORD_TOKEN` → Bot token dari [Discord Developer Portal](https://discord.com/developers/applications)
- `CLIENT_ID` → Application ID bot kamu
- `GUILD_ID` → (Opsional) ID server untuk testing, agar command deploy instant

### 3. Populate Database
```bash
# Scrape semua halaman
npm run scrape

# Atau scrape halaman tertentu (misal halaman 1-10)
node src/scraper.js 1 10
```

### 4. Deploy Commands ke Discord
```bash
npm run deploy
```

### 5. Jalankan Bot
```bash
npm start
```

---

## Commands

| Command | Deskripsi |
|---------|-----------|
| `/search [query]` | Search cosplay berdasarkan nama coser, karakter, atau parody |
| `/stats` | Lihat jumlah data di database |

## Cara Kerja

```
User ketik /search "Velvet"
         ↓
Bot cari di SQLite (FTS5 full-text search)
         ↓
Tampil embed: cover + nama coser + karakter + link
         ↓
Tombol ◀️ ▶️ untuk paging hasil
```

## Update Database
Jalankan scraper secara berkala untuk update data terbaru:
```bash
npm run scrape
```

Data yang sudah ada akan di-update (upsert), tidak ada duplikat.
