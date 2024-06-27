const express = require('express');
const chatCompletionsController = require('../controllers/chatCompletionsController');

const router = express.Router();

router.post('/', chatCompletionsController.getChatCompletion);

module.exports = router;