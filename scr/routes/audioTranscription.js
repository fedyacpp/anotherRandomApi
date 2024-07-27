const express = require('express');
const audioTranscriptionController = require('../controllers/audioTranscriptionController');
const rateLimit = require('express-rate-limit');
const Logger = require('../helpers/logger');
const multer = require('multer');

const router = express.Router();

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25 MB
  },
});

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many requests from this IP, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
});

router.post('/',
    (req, res, next) => {
        Logger.info(`Incoming audio transcription request`, { ip: req.ip });
        next();
    },
    limiter,
    upload.single('file'),
    audioTranscriptionController.getAudioTranscription
);

module.exports = router;