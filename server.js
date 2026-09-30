// Zero-dependency full-stack server with accounts. Run: node server.js
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const PORT = process.env.PORT || 3000;
const DIR = process.env.DATA_DIR || __dirname;           // put on a persistent disk in production
const ORIGIN = process.env.ALLOW_ORIGIN || '*';          // set to your GitHub Pages URL if frontend is hosted separately
fs.mkdirSync(DIR, { recursive: true });
const DB = path.join(DIR, 'data.json'), PUB = path.join(__dirname, 'public');
let db = { users: [], tasks: [], lists: [] };
try { db = Object.assign(db, JSON.parse(fs.readFileSync(DB, 'utf8'))); } catch {}
const SECRET = process.env.SECRET || db.secret || (db.secret = crypto.randomBytes(32).toString('hex'));
let queued = false;
const save = () => { if (queued) return; queued = true; setImmediate(() => { queued = false; fs.writeFileSync(DB + '.tmp', JSON.stringify(db)); fs.renameSync(DB + '.tmp', DB); }); };
save();
const uid = () => Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
const hash = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString('hex');
const sign = s => crypto.createHmac('sha256', SECRET).update(s).digest('hex');
const makeToken = id => { const p = id + '.' + (Date.now() + 30 * 864e5); return p + '.' + sign(p); };
const readToken = h => {
  const t = (h || '').replace(/^Bearer /, ''), [id, exp, sig] = t.split('.');
  if (!sig || sig !== sign(id + '.' + exp) || +exp < Date.now()) return null;
  return db.users.find(u => u.id === id) || null;
};
const tries = new Map();
const limited = ip => { const now = Date.now(), e = tries.get(ip); if (!e || e.reset < now) { tries.set(ip, { n: 1, reset: now + 9e5 }); return false; } return ++e.n > 20; };
const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
const body = req => new Promise(r => { let s = ''; req.on('data', c => { s += c; if (s.length > 1e5) req.destroy(); }); req.on('end', () => { try { r(JSON.parse(s || '{}')); } catch { r({}); } }); });
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };
const FLAGS = ['red', 'green', 'blue'], cleanFlag = f => FLAGS.includes(f) ? f : null;
const FIELDS = ['title', 'done', 'important', 'myDay', 'due', 'assigned', 'flag', 'listId'];

http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const url = req.url.split('?')[0], parts = url.split('/').filter(Boolean);
  if (url === '/health') return send(res, 200, { ok: true });
  if (parts[0] === 'api') {
    const [, kind, key] = parts;
    if ((kind === 'login' || kind === 'register') && req.method === 'POST') {
      if (limited(req.socket.remoteAddress)) return send(res, 429, { error: 'Too many attempts. Try again later.' });
      const b = await body(req), name = String(b.username || '').trim(), pw = String(b.password || '');
      if (kind === 'register') {
        if (!/^[\w.-]{3,30}$/.test(name)) return send(res, 400, { error: 'Username: 3-30 letters, numbers, . _ -' });
        if (pw.length < 6) return send(res, 400, { error: 'Password must be at least 6 characters.' });
        if (db.users.some(u => u.name.toLowerCase() === name.toLowerCase())) return send(res, 409, { error: 'That username is taken.' });
        const salt = crypto.randomBytes(16).toString('hex'), u = { id: uid(), name, salt, hash: hash(pw, salt) };
        db.users.push(u); save(); return send(res, 201, { token: makeToken(u.id) });
      }
      const u = db.users.find(x => x.name.toLowerCase() === name.toLowerCase());
      if (!u || !crypto.timingSafeEqual(Buffer.from(hash(pw, u.salt)), Buffer.from(u.hash))) return send(res, 401, { error: 'Wrong username or password.' });
      return send(res, 200, { token: makeToken(u.id) });
    }
    const user = readToken(req.headers.authorization);
    if (!user) return send(res, 401, { error: 'Sign in required.' });
    const mine = x => x.userId === user.id;
    if (kind === 'data' && req.method === 'GET') return send(res, 200, { user: user.name, tasks: db.tasks.filter(mine), lists: db.lists.filter(mine) });
    if (kind === 'tasks') {
      if (req.method === 'POST') {
        const b = await body(req);
        if (!String(b.title || '').trim()) return send(res, 400, { error: 'Title required' });
        const t = { id: uid(), userId: user.id, title: String(b.title).trim().slice(0, 500), done: false, important: !!b.important, myDay: !!b.myDay,
          due: b.due || null, assigned: !!b.assigned, type: b.type === 'email' ? 'email' : 'task', flag: cleanFlag(b.flag), listId: b.listId || null, created: Date.now() };
        db.tasks.unshift(t); save(); return send(res, 201, t);
      }
      const t = db.tasks.find(x => x.id === key && mine(x));
      if (!t) return send(res, 404, { error: 'Not found' });
      if (req.method === 'PATCH') { const b = await body(req); FIELDS.forEach(f => { if (f in b) t[f] = f === 'flag' ? cleanFlag(b[f]) : b[f]; }); save(); return send(res, 200, t); }
      if (req.method === 'DELETE') { db.tasks = db.tasks.filter(x => x.id !== key); save(); return send(res, 200, {}); }
    }
    if (kind === 'lists') {
      if (req.method === 'POST') {
        const b = await body(req);
        if (!String(b.name || '').trim()) return send(res, 400, { error: 'Name required' });
        const l = { id: uid(), userId: user.id, name: String(b.name).trim().slice(0, 100) }; db.lists.push(l); save(); return send(res, 201, l);
      }
      if (req.method === 'DELETE' && db.lists.some(l => l.id === key && mine(l))) { db.lists = db.lists.filter(l => l.id !== key); db.tasks = db.tasks.filter(t => t.listId !== key); save(); return send(res, 200, {}); }
    }
    return send(res, 404, { error: 'Not found' });
  }
  const file = path.join(PUB, url === '/' ? 'index.html' : url);
  if (!file.startsWith(PUB)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (e, data) => {
    if (e) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }); res.end(data);
  });
}).listen(PORT, () => console.log(`To Do app running at http://localhost:${PORT}`));
