const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs'); 
const DB_PATH = path.join(__dirname, '../data/cosplay.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS cosplay (
      id INTEGER PRIMARY KEY,
      title TEXT,
      coser TEXT,
      character TEXT,
      parody TEXT,
      cover_url TEXT,
      page_url TEXT,
      photo_count INTEGER DEFAULT 0,
      created_at TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_coser ON cosplay(coser);
    CREATE INDEX IF NOT EXISTS idx_character ON cosplay(character);
    CREATE INDEX IF NOT EXISTS idx_parody ON cosplay(parody);

    CREATE VIRTUAL TABLE IF NOT EXISTS cosplay_fts USING fts5(
      id UNINDEXED,
      title,
      coser,
      character,
      parody,
      content='cosplay',
      content_rowid='id'
    );

    CREATE TRIGGER IF NOT EXISTS cosplay_ai AFTER INSERT ON cosplay BEGIN
      INSERT INTO cosplay_fts(rowid, id, title, coser, character, parody)
      VALUES (new.id, new.id, new.title, new.coser, new.character, new.parody);
    END;

    CREATE TRIGGER IF NOT EXISTS cosplay_au AFTER UPDATE ON cosplay BEGIN
      INSERT INTO cosplay_fts(cosplay_fts, rowid, id, title, coser, character, parody)
      VALUES ('delete', old.id, old.id, old.title, old.coser, old.character, old.parody);
      INSERT INTO cosplay_fts(rowid, id, title, coser, character, parody)
      VALUES (new.id, new.id, new.title, new.coser, new.character, new.parody);
    END;
  `);
}

function upsertCosplay(data) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO cosplay (id, title, coser, character, parody, cover_url, page_url, photo_count, created_at)
    VALUES (@id, @title, @coser, @character, @parody, @cover_url, @page_url, @photo_count, @created_at)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      coser = excluded.coser,
      character = excluded.character,
      parody = excluded.parody,
      cover_url = excluded.cover_url,
      photo_count = excluded.photo_count,
      updated_at = CURRENT_TIMESTAMP
  `);
  return stmt.run(data);
}

function searchCosplay(query, limit = 5, offset = 0) {
  const db = getDb();

  // FTS search
  try {
    const results = db.prepare(`
      SELECT c.* FROM cosplay c
      INNER JOIN cosplay_fts fts ON c.id = fts.id
      WHERE cosplay_fts MATCH ?
      ORDER BY rank
      LIMIT ? OFFSET ?
    `).all(`"${query}"*`, limit, offset);

    const total = db.prepare(`
      SELECT COUNT(*) as count FROM cosplay c
      INNER JOIN cosplay_fts fts ON c.id = fts.id
      WHERE cosplay_fts MATCH ?
    `).get(`"${query}"*`);

    return { results, total: total.count };
  } catch {
    // Fallback ke LIKE jika FTS error
    const like = `%${query}%`;
    const results = db.prepare(`
      SELECT * FROM cosplay
      WHERE title LIKE ? OR coser LIKE ? OR character LIKE ? OR parody LIKE ?
      ORDER BY id DESC
      LIMIT ? OFFSET ?
    `).all(like, like, like, like, limit, offset);

    const total = db.prepare(`
      SELECT COUNT(*) as count FROM cosplay
      WHERE title LIKE ? OR coser LIKE ? OR character LIKE ? OR parody LIKE ?
    `).get(like, like, like, like);

    return { results, total: total.count };
  }
}

function getStats() {
  const db = getDb();
  return db.prepare('SELECT COUNT(*) as total FROM cosplay').get();
}

module.exports = { getDb, upsertCosplay, searchCosplay, getStats };
