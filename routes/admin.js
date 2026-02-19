const express = require('express');
const router = express.Router();

// Middleware to check if admin
const isAdmin = (req, res, next) => {
    if (req.session.role === 'admin') return next();
    res.redirect('/login');
};

router.use(isAdmin);

router.get('/', (req, res) => res.render('admin/dashboard'));
router.get('/users', (req, res) => res.render('admin/users'));
router.get('/menu', (req, res) => res.render('admin/menu'));
router.get('/announcements', (req, res) => res.render('admin/announcements'));
router.get('/pk', (req, res) => res.render('admin/pk'));
router.get('/events', (req, res) => res.render('admin/events'));
router.get('/employee', (req, res) => res.render('admin/employee'));

module.exports = router;