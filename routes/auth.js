const express = require('express');
const router = express.Router();

router.get('/login', (req, res) => res.render('login', { error: req.query.error }));
router.get('/register', (req, res) => res.render('register', { error: req.query.error }));

router.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

module.exports = router;