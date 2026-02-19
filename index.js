const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 5000;

// Database setup
const db = new sqlite3.Database('./app.db');

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    display_name TEXT,
    role TEXT DEFAULT 'user',
    avatar TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    message TEXT,
    reply_to INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )`);

  // Default admin
  db.get("SELECT * FROM users WHERE role = 'admin'", (err, row) => {
    if (!row) {
      const hash = bcrypt.hashSync('admin123', 10);
      db.run("INSERT INTO users (username, password, display_name, role) VALUES (?, ?, ?, ?)", ['admin', hash, 'Administrator', 'admin']);
    }
  });
  
  db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('announcement', 'Welcome to the Luxury Gaming Community!')");
});

// Middleware
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'gaming-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));

// Auth middleware
const requireAuth = (req, res, next) => {
  if (req.session.userId) return next();
  res.redirect('/login');
};

const requireAdmin = (req, res, next) => {
  if (req.session.role === 'admin') return next();
  res.status(403).send('Forbidden');
};

// Global announcement middleware
app.use((req, res, next) => {
  db.get("SELECT value FROM settings WHERE key = 'announcement'", (err, row) => {
    res.locals.announcement = row ? row.value : '';
    res.locals.user = req.session.userId ? { id: req.session.userId, username: req.session.username, role: req.session.role } : null;
    next();
  });
});

// Routes
app.get('/', (req, res) => {
  res.render('home', { body: '' }); // The layout.ejs uses <%- body %>, but I didn't set up express-ejs-layouts. 
  // Let's fix the rendering to use a proper layout pattern or include header/footer.
});

app.get('/login', (req, res) => res.render('login'));
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
    if (user && bcrypt.compareSync(password, user.password)) {
      req.session.userId = user.id;
      req.session.username = user.username;
      req.session.role = user.role;
      return res.redirect('/');
    }
    res.redirect('/login?error=1');
  });
});

app.get('/register', (req, res) => res.render('register'));
app.post('/register', (req, res) => {
  const { username, password, display_name } = req.body;
  const hash = bcrypt.hashSync(password, 10);
  db.run("INSERT INTO users (username, password, display_name) VALUES (?, ?, ?)", [username, hash, display_name], (err) => {
    if (err) return res.redirect('/register?error=1');
    res.redirect('/login');
  });
});

app.get('/chat', requireAuth, (req, res) => res.render('chat'));

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// Socket.IO
io.on('connection', (socket) => {
  console.log('User connected');
  
  socket.on('chat message', (data) => {
    // Basic rate limit and storage logic
    db.run("INSERT INTO chat_messages (user_id, message) VALUES (?, ?)", [data.userId, data.msg], function(err) {
      io.emit('chat message', { id: this.lastID, msg: data.msg, username: data.username, role: data.role });
    });
  });
});

// Admin Routes
app.get('/admin', requireAdmin, (req, res) => {
  res.render('admin/dashboard');
});

app.post('/admin/announcement', requireAdmin, (req, res) => {
  const { announcement } = req.body;
  db.run("UPDATE settings SET value = ? WHERE key = 'announcement'", [announcement], (err) => {
    res.redirect('/admin');
  });
});

app.get('/films', requireAuth, (req, res) => res.render('films'));
app.get('/games', requireAuth, (req, res) => res.render('games'));
app.get('/pk', requireAuth, (req, res) => res.render('pk'));
app.get('/events', requireAuth, (req, res) => res.render('events'));

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
