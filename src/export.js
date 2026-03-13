require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { getDb } = require('./database');

const OUTPUT = path.join(__dirname, '../web/public/cosplay.json');

function exportToJson() {
  const db = getDb();
  console.log('📦 Exporting database to JSON...');

  const rows = db.prepare(`
    SELECT id, coser, character, parody, cover_url, page_url, photo_count
    FROM cosplay
    ORDER BY id DESC
  `).all();

  // Buat folder kalau belum ada
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });

  fs.writeFileSync(OUTPUT, JSON.stringify(rows));

  const sizeMb = (fs.statSync(OUTPUT).size / 1024 / 1024).toFixed(2);
  console.log(`✅ Exported ${rows.length} items → web/public/cosplay.json (${sizeMb} MB)`);
}

exportToJson();
