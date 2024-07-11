const express = require('express');
const chatCompletionsController = require('../controllers/chatCompletionsController');
const apiKeyMiddleware = require('../middleware/apiKeyMiddleware');
const rateLimit = require('express-rate-limit');
const Logger = require('../helpers/logger');

const router = express.Router();

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many requests from this IP, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
});

router.post('/',
    (req, res, next) => {
        Logger.info(`Incoming chat completion request`, { ip: req.ip });
        next();
    },
    limiter,
    apiKeyMiddleware,
    chatCompletionsController.getChatCompletion
);

module.exports = router;