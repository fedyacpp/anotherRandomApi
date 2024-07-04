const express = require('express');
const modelsController = require('../controllers/modelsController');
const apiKeyMiddleware = require('../middleware/apiKeyMiddleware');

const router = express.Router();

router.get('/', apiKeyMiddleware, modelsController.getModels);

module.exports = router;