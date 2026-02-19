const express = require('express');
const router = express.Router();

router.get('/', (req, res) => res.render('home'));
router.get('/chat', (req, res) => res.render('chat'));
router.get('/films', (req, res) => res.render('films'));
router.get('/games', (req, res) => res.render('games'));
router.get('/pk', (req, res) => res.render('pk'));
router.get('/events', (req, res) => res.render('events'));

module.exports = router;