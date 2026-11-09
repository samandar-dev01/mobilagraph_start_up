// Mobilograf backend: Node.js + SQLite (node:sqlite) + email-code login.
try { process.loadEnvFile(require('path').join(__dirname, '.env')); } catch {}
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');
const nodemailer = require('nodemailer');

const PORT = process.env.PORT || 3000;
const { GMAIL_USER, GMAIL_APP_PASSWORD } = process.env;
const mailer = GMAIL_USER && GMAIL_APP_PASSWORD
  ? nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD } })
  : null;
if (!mailer) console.warn('\n[dev mode] GMAIL_USER / GMAIL_APP_PASSWORD yo’q: kodlar shu terminalda chiqadi, xat yuborilmaydi.\n');

const CITIES = ['Toshkent', 'Samarqand', 'Buxoro', 'Farg’ona'];
const CATEGORIES = ['To’y', 'Tug’ilgan kun', 'Reklama', 'Fotosessiya', 'Reels', 'Dron'];

// ---------- database ----------
const db = new DatabaseSync(path.join(__dirname, 'data.db'));
db.exec(`
PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN('client','mobilograf')), created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, exp INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS profiles(user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, city TEXT NOT NULL DEFAULT 'Toshkent', bio TEXT NOT NULL DEFAULT '', price_from INTEGER NOT NULL DEFAULT 0, categories TEXT NOT NULL DEFAULT '', rating REAL NOT NULL DEFAULT 0, reviews INTEGER NOT NULL DEFAULT 0, published INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS requests(id INTEGER PRIMARY KEY, client_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, mobilograf_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, event_type TEXT NOT NULL, event_date TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'new' CHECK(status IN('new','accepted','declined')), created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_req_m ON requests(mobilograf_id); CREATE INDEX IF NOT EXISTS idx_req_c ON requests(client_id);
`);

if (!db.prepare('SELECT 1 FROM profiles').get()) {
  const seed = [
    ['Aziz Karimov', 'Toshkent', 'To’y va tug’ilgan kunlar uchun 6 yillik tajriba. Suratga olish va tezkor montaj.', 1200000, 'To’y,Tug’ilgan kun,Fotosessiya', 4.9, 87],
    ['Dilnoza Yusupova', 'Samarqand', 'Reels, reklama va mahsulot videolari. Ijtimoiy tarmoq uchun kontent.', 800000, 'Reels,Reklama', 4.8, 54],
    ['Jasur Rahimov', 'Buxoro', 'Dron bilan suratga olish va to’y videolari. Sifatli uskunalar.', 1500000, 'Dron,To’y', 4.7, 31],
    ['Madina Tursunova', 'Farg’ona', 'Bolalar bayrami va oilaviy fotosessiyalar. Samimiy kadrlar.', 600000, 'Tug’ilgan kun,Fotosessiya', 4.9, 72],
    ['Sardor Ergashev', 'Toshkent', 'Reklama roliklari, kafe va restoran uchun video.', 1000000, 'Reklama,Reels', 4.6, 40],
    ['Nigora Abdullayeva', 'Toshkent', 'To’y kuni to’liq hisoboti: ertalabdan kechgacha.', 2000000, 'To’y,Fotosessiya,Dron', 5.0, 63],
    ['Bekzod Olimov', 'Samarqand', 'Tezkor reels va stories montaji, 24 soatda tayyor.', 500000, 'Reels', 4.5, 22],
    ['Zilola Hamidova', 'Buxoro', 'Tug’ilgan kun, sunnat to’yi va oilaviy tadbirlar.', 700000, 'Tug’ilgan kun,To’y', 4.8, 45],
  ];
  const iu = db.prepare('INSERT INTO users(email,name,role,created) VALUES(?,?,?,?)');
  const ip = db.prepare('INSERT INTO profiles(user_id,city,bio,price_from,categories,rating,reviews,published) VALUES(?,?,?,?,?,?,?,1)');
  seed.forEach((s, i) => { const r = iu.run(`seed${i + 1}@mobilograf.invalid`, s[0], 'mobilograf', Date.now()); ip.run(r.lastInsertRowid, s[1], s[2], s[3], s[4], s[5], s[6]); });
}

// ---------- helpers ----------
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const send = (res, code, obj, headers = {}) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers }); res.end(JSON.stringify(obj)); };
const fail = (res, code, error) => send(res, code, { error });
const readBody = req => new Promise((ok, no) => {
  let d = '';
  req.on('data', c => { d += c; if (d.length > 20000) { req.destroy(); no(new Error('big')); } });
  req.on('end', () => { try { ok(d ? JSON.parse(d) : {}); } catch { ok({}); } });
  req.on('error', no);
});
const buckets = new Map();
function limited(key, max, ms) {
  const now = Date.now(); let b = buckets.get(key);
  if (!b || now > b.reset) { b = { n: 0, reset: now + ms }; buckets.set(key, b); }
  return ++b.n > max;
}
setInterval(() => { const n = Date.now(); for (const [k, b] of buckets) if (n > b.reset) buckets.delete(k); for (const [k, c] of codes) if (n > c.exp) codes.delete(k); db.prepare('DELETE FROM sessions WHERE exp<?').run(n); }, 600000).unref();

function sessionUser(req) {
  const m = /(?:^|;\s*)sid=([a-f0-9]{64})/.exec(req.headers.cookie || '');
  if (!m) return null;
  return db.prepare('SELECT u.id,u.email,u.name,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.exp>?').get(m[1], Date.now()) || null;
}
const cookie = (v, age) => `sid=${v}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${age}`;
const card = r => ({ id: r.id, name: r.name, city: r.city, bio: r.bio, price_from: r.price_from, categories: r.categories ? r.categories.split(',') : [], rating: r.rating, reviews: r.reviews });
const str = (v, max) => String(v ?? '').trim().slice(0, max);

// ---------- email codes ----------
const codes = new Map(); // email -> {hash, exp, tries, last}

async function route(req, res, url) {
  const p = url.pathname, m = req.method;
  if (m !== 'GET' && !/application\/json/.test(req.headers['content-type'] || '')) return fail(res, 415, 'JSON kerak');
  const ip = req.socket.remoteAddress;

  if (m === 'POST' && p === '/api/auth/send-code') {
    const b = await readBody(req), email = str(b.email, 320).toLowerCase();
    if (!EMAIL_RE.test(email)) return fail(res, 400, 'Pochta manzili noto’g’ri');
    if (limited('ip:' + ip, 20, 3600000)) return fail(res, 429, 'Juda ko’p urinish, keyinroq qayta urining');
    const prev = codes.get(email);
    if (prev && Date.now() - prev.last < 60000) return fail(res, 429, 'Kodni qayta yuborish uchun 1 daqiqa kuting');
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    codes.set(email, { hash: sha(code), exp: Date.now() + 600000, tries: 0, last: Date.now() });
    try {
      if (mailer) await mailer.sendMail({ from: `"Mobilograf" <${GMAIL_USER}>`, to: email, subject: 'Mobilograf: tasdiqlash kodi',
        text: `Tasdiqlash kodingiz: ${code}\nKod 10 daqiqa amal qiladi. Agar siz so’ramagan bo’lsangiz, bu xatni e’tiborsiz qoldiring.` });
      else console.log(`[dev] ${email} uchun kod: ${code}`);
      return send(res, 200, { ok: true, dev: !mailer });
    } catch (e) { console.error('mail:', e.message); codes.delete(email); return fail(res, 500, 'Xat yuborib bo’lmadi'); }
  }

  if (m === 'POST' && p === '/api/auth/verify') {
    const b = await readBody(req), email = str(b.email, 320).toLowerCase(), code = str(b.code, 6);
    const e = codes.get(email);
    if (!e || Date.now() > e.exp) return fail(res, 400, 'Kod muddati tugagan, yangisini so’rang');
    if (++e.tries > 5) { codes.delete(email); return fail(res, 429, 'Urinishlar ko’p, yangi kod so’rang'); }
    if (!crypto.timingSafeEqual(Buffer.from(e.hash), Buffer.from(sha(code)))) return fail(res, 400, 'Kod noto’g’ri');
    let user = db.prepare('SELECT id FROM users WHERE email=?').get(email);
    if (!user) {
      const name = str(b.name, 60), role = b.role;
      if (name.length < 2) return fail(res, 400, 'Ismingizni kiriting');
      if (role !== 'client' && role !== 'mobilograf') return fail(res, 400, 'Rolni tanlang');
      const r = db.prepare('INSERT INTO users(email,name,role,created) VALUES(?,?,?,?)').run(email, name, role, Date.now());
      user = { id: Number(r.lastInsertRowid) };
      if (role === 'mobilograf') db.prepare('INSERT INTO profiles(user_id) VALUES(?)').run(user.id);
    }
    codes.delete(email);
    const token = crypto.randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions(token,user_id,exp) VALUES(?,?,?)').run(token, user.id, Date.now() + 30 * 86400000);
    return send(res, 200, { ok: true }, { 'Set-Cookie': cookie(token, 2592000) });
  }

  if (m === 'POST' && p === '/api/auth/logout') {
    const mm = /(?:^|;\s*)sid=([a-f0-9]{64})/.exec(req.headers.cookie || '');
    if (mm) db.prepare('DELETE FROM sessions WHERE token=?').run(mm[1]);
    return send(res, 200, { ok: true }, { 'Set-Cookie': cookie('', 0) });
  }

  if (m === 'GET' && p === '/api/meta') return send(res, 200, { cities: CITIES, categories: CATEGORIES });

  if (m === 'GET' && p === '/api/me') {
    const u = sessionUser(req);
    if (!u) return send(res, 200, { user: null });
    const profile = u.role === 'mobilograf' ? card({ ...db.prepare('SELECT * FROM profiles WHERE user_id=?').get(u.id), id: u.id, name: u.name }) : null;
    if (profile) profile.published = !!db.prepare('SELECT published FROM profiles WHERE user_id=?').get(u.id).published;
    return send(res, 200, { user: { id: u.id, name: u.name, email: u.email, role: u.role }, profile });
  }

  if (m === 'GET' && p === '/api/mobilografs') {
    const q = url.searchParams, where = ['p.published=1'], args = [];
    if (CITIES.includes(q.get('city'))) { where.push('p.city=?'); args.push(q.get('city')); }
    if (CATEGORIES.includes(q.get('category'))) { where.push("(','||p.categories||',') LIKE ?"); args.push(`%,${q.get('category')},%`); }
    const max = parseInt(q.get('max'), 10); if (max > 0) { where.push('p.price_from<=?'); args.push(max); }
    const text = str(q.get('q'), 60).replace(/[%_\\]/g, ''); if (text) { where.push('(u.name LIKE ? OR p.bio LIKE ?)'); args.push(`%${text}%`, `%${text}%`); }
    const order = { price: 'p.price_from ASC', rating: 'p.rating DESC, p.reviews DESC' }[q.get('sort')] || 'p.rating DESC, p.reviews DESC';
    const rows = db.prepare(`SELECT u.id,u.name,p.* FROM profiles p JOIN users u ON u.id=p.user_id WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT 100`).all(...args);
    return send(res, 200, { items: rows.map(card) });
  }

  let mm;
  if (m === 'GET' && (mm = /^\/api\/mobilografs\/(\d+)$/.exec(p))) {
    const r = db.prepare('SELECT u.id,u.name,p.* FROM profiles p JOIN users u ON u.id=p.user_id WHERE u.id=? AND p.published=1').get(+mm[1]);
    return r ? send(res, 200, card(r)) : fail(res, 404, 'Topilmadi');
  }

  // ---- authenticated ----
  const user = sessionUser(req);
  if (p.startsWith('/api/') && !user) return fail(res, 401, 'Avval kiring');

  if (m === 'PUT' && p === '/api/me/profile') {
    if (user.role !== 'mobilograf') return fail(res, 403, 'Faqat mobilograflar uchun');
    const b = await readBody(req);
    const city = CITIES.includes(b.city) ? b.city : null;
    const cats = [...new Set((Array.isArray(b.categories) ? b.categories : []).filter(c => CATEGORIES.includes(c)))];
    const price = Math.max(0, Math.min(100000000, parseInt(b.price_from, 10) || 0));
    const bio = str(b.bio, 600), name = str(b.name, 60);
    if (!city) return fail(res, 400, 'Shaharni tanlang');
    if (name.length < 2) return fail(res, 400, 'Ismingizni kiriting');
    const published = price > 0 && cats.length > 0 && bio.length >= 10 ? 1 : 0;
    db.prepare('UPDATE users SET name=? WHERE id=?').run(name, user.id);
    db.prepare('UPDATE profiles SET city=?,bio=?,price_from=?,categories=?,published=? WHERE user_id=?').run(city, bio, price, cats.join(','), published, user.id);
    return send(res, 200, { ok: true, published: !!published });
  }

  if (m === 'POST' && p === '/api/requests') {
    if (user.role !== 'client') return fail(res, 403, 'Faqat buyurtmachilar so’rov yubora oladi');
    if (limited('req:' + user.id, 20, 86400000)) return fail(res, 429, 'Bugungi limit tugadi');
    const b = await readBody(req), target = parseInt(b.mobilograf_id, 10);
    const type = b.event_type, date = str(b.event_date, 10), note = str(b.note, 500);
    if (!db.prepare('SELECT 1 FROM profiles WHERE user_id=? AND published=1').get(target)) return fail(res, 404, 'Mobilograf topilmadi');
    if (!CATEGORIES.includes(type)) return fail(res, 400, 'Tadbir turini tanlang');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date)) || date < new Date().toISOString().slice(0, 10)) return fail(res, 400, 'Sanani to’g’ri kiriting');
    db.prepare('INSERT INTO requests(client_id,mobilograf_id,event_type,event_date,note,created) VALUES(?,?,?,?,?,?)').run(user.id, target, type, date, note, Date.now());
    return send(res, 201, { ok: true });
  }

  if (m === 'GET' && p === '/api/requests') {
    const mine = user.role === 'client';
    const rows = db.prepare(`SELECT r.id,r.event_type,r.event_date,r.note,r.status,r.created,u.name AS other_name,u.id AS other_id${mine ? '' : ',u.email AS other_email'}
      FROM requests r JOIN users u ON u.id=${mine ? 'r.mobilograf_id' : 'r.client_id'} WHERE ${mine ? 'r.client_id' : 'r.mobilograf_id'}=? ORDER BY r.created DESC LIMIT 200`).all(user.id);
    return send(res, 200, { items: rows });
  }

  if (m === 'PATCH' && (mm = /^\/api\/requests\/(\d+)$/.exec(p))) {
    if (user.role !== 'mobilograf') return fail(res, 403, 'Ruxsat yo’q');
    const b = await readBody(req);
    if (!['accepted', 'declined'].includes(b.status)) return fail(res, 400, 'Noto’g’ri holat');
    const r = db.prepare('UPDATE requests SET status=? WHERE id=? AND mobilograf_id=?').run(b.status, +mm[1], user.id);
    return r.changes ? send(res, 200, { ok: true }) : fail(res, 404, 'Topilmadi');
  }

  return fail(res, 404, 'Topilmadi');
}

// ---------- static files ----------
const PUB = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    if (url.pathname.startsWith('/api/')) return await route(req, res, url);
    if (req.method !== 'GET') { res.writeHead(405); return res.end(); }
    let rel = decodeURIComponent(url.pathname); if (rel === '/') rel = '/index.html';
    const file = path.normalize(path.join(PUB, rel));
    if (!file.startsWith(PUB + path.sep)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end('Topilmadi'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' }); res.end(data);
    });
  } catch (e) { console.error(e); if (!res.headersSent) fail(res, 500, 'Server xatosi'); }
}).listen(PORT, () => console.log(`Mobilograf: http://localhost:${PORT}`));
