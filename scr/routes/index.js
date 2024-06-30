const express = require('express');
const chatCompletionsRouter = require('./chatCompletions');
const modelsRouter = require('./models');
const config = require('../config');
const chatRoutes = require('./chat');

const router = express.Router();

router.use('/chat/completions', chatCompletionsRouter);
router.use('/models', modelsRouter);
if (config.environment === 'development') {
    router.use('/chat', chatRoutes);
}

module.exports = router;