const express = require('express');
const chatCompletionsRouter = require('./chatCompletions');
const modelsRouter = require('./models');
const imageGenerationsRouter = require('./imageGenerations');
const config = require('../config');
const helmet = require('helmet');

const router = express.Router();

router.use(helmet());

router.use('/chat/completions', chatCompletionsRouter);
router.use('/models', modelsRouter);
router.use('/images/generations', imageGenerationsRouter);

if (config.environment !== 'development') {
    router.use((req, res, next) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        next();
    });
}

router.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

module.exports = router;