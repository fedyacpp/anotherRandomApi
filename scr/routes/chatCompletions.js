const express = require('express');
const chatCompletionsController = require('../controllers/chatCompletionsController');
const apiKeyMiddleware = require('../middleware/apiKeyMiddleware');

const router = express.Router();

router.post('/', apiKeyMiddleware, chatCompletionsController.getChatCompletion);

module.exports = router;