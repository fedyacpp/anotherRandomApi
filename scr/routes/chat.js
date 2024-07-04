const express = require('express');
const router = express.Router();
const path = require('path');
const config = require('../config');

if (config.environment === 'development') {
    router.get('/chat', (req, res) => {
        res.sendFile(path.join(__dirname, '../public/chat.html'));
    });
}

module.exports = router;