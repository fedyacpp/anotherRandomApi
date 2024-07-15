const express = require('express');
const imageGenerationsController = require('../controllers/imageGenerationsController');
const rateLimit = require('express-rate-limit');
const Logger = require('../helpers/logger');

const router = express.Router();

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many image generation requests from this IP, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
});

router.post('/',
    (req, res, next) => {
        Logger.info(`Incoming image generation request`, { ip: req.ip });
        next();
    },
    limiter,
    imageGenerationsController.generateImage
);

module.exports = router;