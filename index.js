const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 5000;

const db = new sqlite3.Database('./app.db');

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

    // Default admin
    db.get("SELECT * FROM users WHERE username = 'admin'", (err, row) => {
        if (!row) {
            const hash = bcrypt.hashSync('admin123', 10);
            db.run("INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)", 
                ['admin', hash, 'Yönetici', 'admin']);
        }
    });

    db.get("SELECT * FROM announcements WHERE is_active = 1", (err, row) => {
        if (!row) {
            db.run("INSERT INTO announcements (text) VALUES (?)", ['Lüks Oyun Topluluğuna Hoş Geldiniz!']);
        }
    });
});

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'luxe-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
}));

// Global locals
app.use((req, res, next) => {
    db.get("SELECT text FROM announcements WHERE is_active = 1 ORDER BY id DESC LIMIT 1", (err, ann) => {
        db.all("SELECT * FROM menu_links WHERE visible = 1 ORDER BY sort_order ASC", (err, links) => {
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
    });
});

app.get('/cikis', (req, res) => {
    req.session.destroy();
    res.redirect('/giris');
});

// Admin
app.get('/admin', requireAdmin, (req, res) => res.render('admin/dashboard'));
app.get('/admin/users', requireAdmin, (req, res) => {
    db.all("SELECT id, username, role, display_name FROM users", (err, users) => {
        res.render('admin/users', { users });
    });
});
app.post('/admin/users/role', requireAdmin, (req, res) => {
    const { userId, role } = req.body;
    db.run("UPDATE users SET role = ? WHERE id = ?", [role, userId], () => res.redirect('/admin/users'));
});

app.get('/admin/announcements', requireAdmin, (req, res) => {
    db.all("SELECT * FROM announcements", (err, announcements) => {
        res.render('admin/announcements', { announcements });
    });
});
app.post('/admin/announcements', requireAdmin, (req, res) => {
    const { text } = req.body;
    db.run("INSERT INTO announcements (text) VALUES (?)", [text], () => res.redirect('/admin/announcements'));
});

app.get('/admin/menu', requireAdmin, (req, res) => {
    db.all("SELECT * FROM menu_links ORDER BY sort_order ASC", (err, links) => {
        res.render('admin/menu', { links });
    });
});
app.post('/admin/menu', requireAdmin, (req, res) => {
    const { title, url, sort_order } = req.body;
    db.run("INSERT INTO menu_links (title, url, sort_order) VALUES (?, ?, ?)", 
        [title, url, sort_order], () => res.redirect('/admin/menu'));
});

// Socket.io
io.on('connection', (socket) => {
    socket.on('chat message', (data) => {
        db.run("INSERT INTO messages (user_id, text, reply_to_id) VALUES (?, ?, ?)", 
            [data.userId, data.text, data.replyToId], function(err) {
            io.emit('chat message', { 
                id: this.lastID, 
                text: data.text, 
                username: data.username, 
                role: data.role,
                displayName: data.displayName
            });
        });
    });
    
    socket.on('delete message', (data) => {
        // Logic for delete (admin/mod or owner < 15min)
        db.run("UPDATE messages SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?", [data.id], () => {
            io.emit('message deleted', { id: data.id });
        });
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});