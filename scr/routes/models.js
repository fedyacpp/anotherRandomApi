const express = require('express');
const modelsController = require('../controllers/modelsController');

const router = express.Router();

router.get('/', modelsController.getModels);

module.exports = router;