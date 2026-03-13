require('dotenv').config();
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const { upsertCosplay, getStats } = require('./database');

const BASE_URL = process.env.BASE_URL || 'https://galleryepic.xyz';
const THREADS = 5;
const DETAIL_DELAY = 300;
const PROGRESS_FILE = path.join(__dirname, '../data/scrape_progress.json');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Referer': BASE_URL,
};

// ─── Progress tracking ───────────────────────────────────────────────────────

function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    }
  } catch {}
  return { completed: [], failed: [] };
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

// ─── Page queue (thread-safe via shift) ──────────────────────────────────────

class PageQueue {
  constructor(pages) {
    this.queue = [...pages];
  }
  next() { return this.queue.shift() ?? null; }
  get remaining() { return this.queue.length; }
}

// ─── Fetcher ─────────────────────────────────────────────────────────────────

async function fetchHtml(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await axios.get(url, { headers, timeout: 15000 });
      return res.data;
    } catch {
      if (i < retries - 1) await sleep(1000 * (i + 1));
    }
  }
  return null;
}

function parseListPage(html) {
  const $ = cheerio.load(html);
  const items = [];
  const seen = new Set();

  $('a[href*="/en/cosplay/"]').each((_, el) => {
    const $el = $(el);
    const id = $el.attr('href')?.match(/\/en\/cosplay\/(\d+)/)?.[1];
    if (!id || seen.has(id)) return;
    seen.add(id);

    const coverUrl = $el.find('img[src*="static.galleryepic.xyz"]').first().attr('src') || '';
    const smallText = $el.find('small.font-medium, small.line-clamp-2').first().text().trim();
    const photoMatch = smallText.match(/\[(\d+)P\]/);

    if (coverUrl) {
      items.push({
        id: parseInt(id),
        cover_url: coverUrl,
        raw_text: smallText,
        photo_count: photoMatch ? parseInt(photoMatch[1]) : 0,
        page_url: `${BASE_URL}/en/cosplay/${id}`,
      });
    }
  });

  return items;
}

async function fetchDetail(id) {
  const html = await fetchHtml(`${BASE_URL}/en/cosplay/${id}`);
  if (!html) return null;

  const $ = cheerio.load(html);
  let coser = '', character = '', parody = '', title = '';

  $('script').each((_, el) => {
    const c = $(el).html() || '';
    if (!coser)     { const m = c.match(/"nameEnglish":"([^"]+)"/);      if (m) coser     = m[1]; }
    if (!character) { const m = c.match(/"characterEnglish":"([^"]+)"/); if (m) character = m[1]; }
    if (!parody)    { const m = c.match(/"parodyEnglish":"([^"]+)"/);    if (m) parody    = m[1]; }
  });

  title = $('h2.scroll-m-20').first().text().trim();
  if (!coser) {
    coser = $('meta[name="keywords"]').attr('content')?.split(',')?.[0]?.trim() || '';
  }

  return { coser, character, parody, title };
}

async function detectMaxPage() {
  const html = await fetchHtml(`${BASE_URL}/en/cosplays/1`);
  if (!html) return 1;
  const $ = cheerio.load(html);
  const nums = [];
  $('a[href*="/en/cosplays/"]').each((_, el) => {
    const m = $(el).attr('href')?.match(/\/en\/cosplays\/(\d+)/);
    if (m) nums.push(parseInt(m[1]));
  });
  return nums.length ? Math.max(...nums) : 1;
}

// ─── Worker ──────────────────────────────────────────────────────────────────

async function worker(workerId, queue, progress, stats) {
  while (true) {
    const page = queue.next();
    if (page === null) break;

    const html = await fetchHtml(`${BASE_URL}/en/cosplays/${page}`);
    if (!html) {
      progress.failed.push(page);
      stats.failed++;
      printStatus(stats, queue);
      continue;
    }

    const items = parseListPage(html);

    for (const item of items) {
      try {
        const detail = await fetchDetail(item.id);
        await sleep(DETAIL_DELAY);

        upsertCosplay({
          id: item.id,
          title: detail?.title || item.raw_text,
          coser: detail?.coser || '',
          character: detail?.character || '',
          parody: detail?.parody || '',
          cover_url: item.cover_url,
          page_url: item.page_url,
          photo_count: item.photo_count,
          created_at: new Date().toISOString(),
        });

        stats.saved++;
      } catch {
        stats.failed++;
      }

      printStatus(stats, queue);
    }

    progress.completed.push(page);
    saveProgress(progress); // simpan progress tiap page selesai
  }
}

// ─── Status display ──────────────────────────────────────────────────────────

function printStatus(stats, queue) {
  const elapsed = ((Date.now() - stats.startTime) / 1000).toFixed(0);
  const rate = (stats.saved / (elapsed || 1)).toFixed(1);
  process.stdout.write(
    `\r💾 Saved: ${String(stats.saved).padStart(5)} | ❌ Failed: ${stats.failed} | 📃 Queue: ${String(queue.remaining).padStart(4)} pages | ⏱️ ${elapsed}s | ${rate}/s    `
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function scrapeAll(startPage, endPage, threads) {
  console.log('🚀 Starting multi-thread scraper...');
  console.log(`🧵 Threads: ${threads}`);

  const maxPage = endPage || await detectMaxPage();
  console.log(`📄 Range: page ${startPage} → ${maxPage}`);

  const progress = loadProgress();
  const completedSet = new Set(progress.completed);

  // Hanya scrape halaman yang belum selesai
  const todo = [];
  for (let p = startPage; p <= maxPage; p++) {
    if (!completedSet.has(p)) todo.push(p);
  }

  if (todo.length === 0) {
    console.log('✅ Semua halaman sudah selesai di-scrape!');
    return;
  }

  console.log(`⏭️  Skip: ${completedSet.size} halaman (sudah selesai)`);
  console.log(`📋 Todo: ${todo.length} halaman\n`);

  const queue = new PageQueue(todo);
  const stats = { saved: 0, failed: 0, startTime: Date.now() };

  // Spawn N workers parallel
  await Promise.all(
    Array.from({ length: threads }, (_, i) => worker(i + 1, queue, progress, stats))
  );

  console.log('\n\n' + '─'.repeat(60));
  console.log(`✅ Selesai! Total di DB: ${getStats().total}`);
  console.log(`📃 Pages selesai: ${progress.completed.length}/${maxPage}`);
  if (progress.failed.length > 0) {
    console.log(`❌ Pages gagal (${progress.failed.length}): ${progress.failed.slice(0, 20).join(', ')}...`);
    console.log(`   Jalankan ulang untuk retry otomatis.`);
  }
}

// ─── CLI args ─────────────────────────────────────────────────────────────────
// Usage:
//   npm run scrape                  → scrape semua
//   node src/scraper.js 1 50        → page 1-50
//   node src/scraper.js 1 50 3      → page 1-50, 3 threads
//   node src/scraper.js --reset     → reset progress lalu scrape ulang

const args = process.argv.slice(2);

if (args.includes('--reset')) {
  if (fs.existsSync(PROGRESS_FILE)) {
    fs.unlinkSync(PROGRESS_FILE);
    console.log('🔄 Progress file di-reset!\n');
  }
}

const numArgs = args.filter(a => !a.startsWith('--'));
const startPage = parseInt(numArgs[0]) || 1;
const endPage   = parseInt(numArgs[1]) || null;
const threads   = parseInt(numArgs[2]) || THREADS;

scrapeAll(startPage, endPage, threads).catch(console.error);