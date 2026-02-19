const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: true, credentials: true }
});
const PORT = process.env.PORT || 5000;

// ✅ DB yolu (Render'da kalıcı istiyorsan Disk + /var/data/app.db)
const DB_PATH = process.env.DB_PATH || '/tmp/app.db';
const db = new sqlite3.Database(DB_PATH);

// ✅ Admin kullanıcı/şifre ve session secret ENV'den gelsin
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';
const SESSION_SECRET = process.env.SESSION_SECRET || 'luxe-secret-key';

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password_hash TEXT,
    role TEXT DEFAULT 'user',
    display_name TEXT,
    avatar_url TEXT,
    tag TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT,
    is_active INTEGER DEFAULT 1
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS menu_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    url TEXT,
    visible INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS employee_of_month (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    month TEXT,
    rank INTEGER,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS pk_rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_name TEXT,
    room_id_text TEXT,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(created_by) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS pk_room_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pk_room_id INTEGER,
    user_id INTEGER,
    FOREIGN KEY(pk_room_id) REFERENCES pk_rooms(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    image_url TEXT,
    day TEXT,
    time TEXT,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // ✅ sohbet mesajları (kalıcı)
  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    text TEXT,
    reply_to_id INTEGER,
    likes INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  // ✅ Okunmamış sayaç altyapısı (basit)
  db.run(`CREATE TABLE IF NOT EXISTS last_reads (
    user_id INTEGER PRIMARY KEY,
    last_read_id INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // ✅ Default admin
  db.get("SELECT * FROM users WHERE username = ?", [ADMIN_USER], (err, row) => {
    if (!row) {
      const hash = bcrypt.hashSync(ADMIN_PASS, 10);
      db.run(
        "INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)",
        [ADMIN_USER, hash, 'Yönetici', 'admin']
      );
    }
  });

  db.get("SELECT * FROM announcements WHERE is_active = 1", (err, row) => {
    if (!row) db.run("INSERT INTO announcements (text) VALUES (?)", ['Lüks Oyun Topluluğuna Hoş Geldiniz!']);
  });
});

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// ✅ SESSION (tek kaynak)
const sessionMiddleware = session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // https kullansan bile render proxy var; şimdilik böyle kalsın
});
app.use(sessionMiddleware);

// ✅ Socket.IO session bağlama (kritik)
io.use((socket, next) => sessionMiddleware(socket.request, {}, next));

// Global locals
app.use((req, res, next) => {
  db.get("SELECT text FROM announcements WHERE is_active = 1 ORDER BY id DESC LIMIT 1", (err, ann) => {
    db.all("SELECT * FROM menu_links WHERE visible = 1 ORDER BY sort_order ASC", (err2, links) => {
      res.locals.announcement = ann ? ann.text : '';
      res.locals.menuLinks = links || [];
      res.locals.user = req.session.userId ? {
        id: req.session.userId,
        username: req.session.username,
        role: req.session.role,
        display_name: req.session.displayName
      } : null;
      next();
    });
  });
});

// Auth Middleware
const requireAuth = (req, res, next) => {
  if (req.session.userId) return next();
  res.redirect('/giris');
};
const requireAdmin = (req, res, next) => {
  if (req.session.role === 'admin') return next();
  res.redirect('/giris');
};

// Routes
app.get('/', (req, res) => res.render('home'));
app.get('/chat', requireAuth, (req, res) => res.render('chat'));
app.get('/films', requireAuth, (req, res) => res.render('films'));
app.get('/games', requireAuth, (req, res) => res.render('games'));
app.get('/pk', requireAuth, (req, res) => res.render('pk'));
app.get('/events', requireAuth, (req, res) => res.render('events'));

app.get('/giris', (req, res) => res.render('login', { error: req.query.error }));
app.post('/giris', (req, res) => {
  const { username, password } = req.body;
  db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
    if (user && bcrypt.compareSync(password, user.password_hash)) {
      req.session.userId = user.id;
      req.session.username = user.username;
      req.session.role = user.role;
      req.session.displayName = user.display_name;
      return res.redirect('/');
    }
    res.redirect('/giris?error=1');
  });
});

app.get('/kayit', (req, res) => res.render('register', { error: req.query.error }));
app.post('/kayit', (req, res) => {
  const { username, password, display_name } = req.body;
  const hash = bcrypt.hashSync(password, 10);
  db.run("INSERT INTO users (username, password_hash, display_name) VALUES (?, ?, ?)",
    [username, hash, display_name], (err) => {
      if (err) return res.redirect('/kayit?error=1');
      res.redirect('/giris');
    }
  );
});

app.get('/cikis', (req, res) => {
  req.session.destroy(() => res.redirect('/giris'));
});

// Admin
app.get('/admin', requireAdmin, (req, res) => res.render('admin/dashboard'));
app.get('/admin/users', requireAdmin, (req, res) => {
  db.all("SELECT id, username, role, display_name FROM users", (err, users) => res.render('admin/users', { users }));
});
app.post('/admin/users/role', requireAdmin, (req, res) => {
  const { userId, role } = req.body;
  db.run("UPDATE users SET role = ? WHERE id = ?", [role, userId], () => res.redirect('/admin/users'));
});
app.get('/admin/announcements', requireAdmin, (req, res) => {
  db.all("SELECT * FROM announcements", (err, announcements) => res.render('admin/announcements', { announcements }));
});
app.post('/admin/announcements', requireAdmin, (req, res) => {
  const { text } = req.body;
  db.run("INSERT INTO announcements (text) VALUES (?)", [text], () => res.redirect('/admin/announcements'));
});
app.get('/admin/menu', requireAdmin, (req, res) => {
  db.all("SELECT * FROM menu_links ORDER BY sort_order ASC", (err, links) => res.render('admin/menu', { links }));
});
app.post('/admin/menu', requireAdmin, (req, res) => {
  const { title, url, sort_order } = req.body;
  db.run("INSERT INTO menu_links (title, url, sort_order) VALUES (?, ?, ?)", [title, url, sort_order], () => res.redirect('/admin/menu'));
});

// ===== Socket.IO: Kalıcı sohbet + yetkili silme + history + unread altyapı =====

function canModerate(role) {
  return role === 'admin' || role === 'moderator';
}

io.on('connection', (socket) => {
  const sess = socket.request.session;

  // Giriş yoksa sadece dinleyici olsun; yazdırma yok.
  const userId = sess?.userId || null;
  const username = sess?.username || 'guest';
  const role = sess?.role || 'user';
  const displayName = sess?.displayName || username;

  // 1) Bağlanınca son 50 mesajı gönder
  socket.on('chat:history', (cb) => {
    if (!userId) return cb && cb({ ok: false, error: 'auth' });

    db.all(`
      SELECT m.id, m.text, m.user_id, m.created_at, m.deleted_at,
             u.username, u.role, u.display_name
      FROM messages m
      LEFT JOIN users u ON u.id = m.user_id
      ORDER BY m.id DESC
      LIMIT 50
    `, (err, rows) => {
      if (err) return cb && cb({ ok: false, error: 'db' });
      const list = (rows || []).reverse().map(r => ({
        id: r.id,
        text: r.deleted_at ? '[silindi]' : r.text,
        userId: r.user_id,
        username: r.username || 'user',
        role: r.role || 'user',
        displayName: r.display_name || r.username || 'user',
        createdAt: r.created_at,
        deleted: !!r.deleted_at
      }));
      cb && cb({ ok: true, messages: list });
    });
  });

  // 2) Unread sayısı (basit)
  socket.on('chat:unread', (cb) => {
    if (!userId) return cb && cb({ ok: false, error: 'auth' });

    db.get("SELECT last_read_id FROM last_reads WHERE user_id = ?", [userId], (e1, lr) => {
      const lastReadId = lr?.last_read_id || 0;
      db.get("SELECT MAX(id) as maxId FROM messages WHERE deleted_at IS NULL", (e2, mx) => {
        const maxId = mx?.maxId || 0;
        const unread = Math.max(0, maxId - lastReadId);
        cb && cb({ ok: true, unread, lastReadId, maxId });
      });
    });
  });

  // 3) Okundu işaretle
  socket.on('chat:markRead', (data) => {
    if (!userId) return;
    const lastReadId = Number(data?.lastReadId || 0);
    db.run(`
      INSERT INTO last_reads (user_id, last_read_id, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET
        last_read_id = excluded.last_read_id,
        updated_at = CURRENT_TIMESTAMP
    `, [userId, lastReadId]);
  });

  // 4) Mesaj gönder (kalıcı)
  socket.on('chat message', (data, cb) => {
    if (!userId) return cb && cb({ ok: false, error: 'auth' });

    const text = (data?.text ?? data?.msg ?? '').toString().trim();
    const replyToId = data?.replyToId ? Number(data.replyToId) : null;
    if (!text) return cb && cb({ ok: false, error: 'empty' });

    db.run(
      "INSERT INTO messages (user_id, text, reply_to_id) VALUES (?, ?, ?)",
      [userId, text, replyToId],
      function (err) {
        if (err) return cb && cb({ ok: false, error: 'db' });

        const payload = {
          id: this.lastID,
          text,
          userId,
          username,
          role,
          displayName,
          createdAt: new Date().toISOString()
        };

        io.emit('chat message', payload);
        cb && cb({ ok: true, message: payload });
      }
    );
  });

  // 5) Mesaj silme:
  // - admin/mod: herkesi silebilir
  // - user: sadece kendi mesajını 15 dk içinde silebilir
  socket.on('delete message', (data, cb) => {
    if (!userId) return cb && cb({ ok: false, error: 'auth' });

    const msgId = Number(data?.id);
    if (!msgId) return cb && cb({ ok: false, error: 'bad_id' });

    db.get("SELECT id, user_id, created_at, deleted_at FROM messages WHERE id = ?", [msgId], (err, row) => {
      if (err || !row) return cb && cb({ ok: false, error: 'not_found' });
      if (row.deleted_at) return cb && cb({ ok: true });

      const isOwner = row.user_id === userId;
      const mod = canModerate(role);

      if (!mod) {
        if (!isOwner) return cb && cb({ ok: false, error: 'forbidden' });

        // 15 dk kuralı
        const created = new Date(row.created_at).getTime();
        const now = Date.now();
        const diffMin = (now - created) / 60000;
        if (diffMin > 15) return cb && cb({ ok: false, error: 'time_limit' });
      }

      db.run("UPDATE messages SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?", [msgId], () => {
        io.emit('message deleted', { id: msgId });
        cb && cb({ ok: true });
      });
    });
  });

  // 6) Tüm sohbeti temizle (SADECE admin/mod)
  socket.on('chat:purge', (cb) => {
    if (!userId) return cb && cb({ ok: false, error: 'auth' });
    if (!canModerate(role)) return cb && cb({ ok: false, error: 'forbidden' });

    db.run("UPDATE messages SET deleted_at = CURRENT_TIMESTAMP WHERE deleted_at IS NULL", [], () => {
      io.emit('chat purged', { by: username, role });
      cb && cb({ ok: true });
    });
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
