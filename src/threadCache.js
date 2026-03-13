const { getDb } = require('./database');

function initThreadCache() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS thread_cache (
      query_key TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      thread_name TEXT,
      creator_id TEXT,
      creator_tag TEXT,
      cosplay_id INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function getCachedThread(queryKey) {
  const db = getDb();
  initThreadCache();
  return db.prepare('SELECT * FROM thread_cache WHERE query_key = ?').get(queryKey);
}

function saveThreadCache({ queryKey, threadId, threadName, creatorId, creatorTag, cosplayId }) {
  const db = getDb();
  initThreadCache();
  db.prepare(`
    INSERT OR REPLACE INTO thread_cache (query_key, thread_id, thread_name, creator_id, creator_tag, cosplay_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(queryKey, threadId, threadName, creatorId, creatorTag, cosplayId);
}

function makeQueryKey(cosplayId) {
  return `cosplay_${cosplayId}`;
}

module.exports = { getCachedThread, saveThreadCache, makeQueryKey, initThreadCache };