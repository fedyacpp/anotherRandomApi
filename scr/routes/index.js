const express = require('express');
const chatCompletionsRouter = require('./chatCompletions');
const modelsRouter = require('./models');

const router = express.Router();

router.use('/chat/completions', chatCompletionsRouter);
router.use('/models', modelsRouter);

module.exports = router;