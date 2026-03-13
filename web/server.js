require('dotenv').config();
const http = require('http');
const path = require('path');
const fs = require('fs');
const { getDb } = require('../src/database');

const PORT = process.env.WEB_PORT || 3000;

function getAllCosplay(page = 1, limit = 50, search = '') {
  const db = getDb();
  const offset = (page - 1) * limit;

  if (search) {
    const like = `%${search}%`;
    const rows = db.prepare(`
      SELECT * FROM cosplay
      WHERE coser LIKE ? OR character LIKE ? OR parody LIKE ? OR title LIKE ?
      ORDER BY id DESC LIMIT ? OFFSET ?
    `).all(like, like, like, like, limit, offset);
    const total = db.prepare(`
      SELECT COUNT(*) as c FROM cosplay
      WHERE coser LIKE ? OR character LIKE ? OR parody LIKE ? OR title LIKE ?
    `).get(like, like, like, like).c;
    return { rows, total };
  }

  const rows = db.prepare('SELECT * FROM cosplay ORDER BY id DESC LIMIT ? OFFSET ?').all(limit, offset);
  const total = db.prepare('SELECT COUNT(*) as c FROM cosplay').get().c;
  return { rows, total };
}

const HTML = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // API endpoint
  if (url.pathname === '/api/cosplay') {
    const page   = parseInt(url.searchParams.get('page'))   || 1;
    const limit  = parseInt(url.searchParams.get('limit'))  || 50;
    const search = url.searchParams.get('search') || '';

    const data = getAllCosplay(page, limit, search);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(data));
    return;
  }

  // Serve HTML
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(HTML);
});

server.listen(PORT, () => {
  console.log(`🌐 Web list running at http://localhost:${PORT}`);
});
