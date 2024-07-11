const express = require('express');
const router = express.Router();
const path = require('path');
const config = require('../config');

if (config.environment === 'development') {
    router.get('/chat', (req, res) => {
        res.sendFile(path.join(__dirname, '../public/chat.html'));
    });

    const staticOptions = {
        maxAge: '1d',
        etag: true,
        lastModified: true
    };

    router.use('/styles', express.static(path.join(__dirname, '../public/styles'), staticOptions));
    router.use('/js', express.static(path.join(__dirname, '../public/js'), staticOptions));
} else {
    router.use((req, res) => {
        res.status(404).json({ error: 'Not found' });
    });
}

module.exports = router;