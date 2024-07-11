const express = require('express');
const modelsController = require('../controllers/modelsController');
const Logger = require('../helpers/logger');
const mcache = require('memory-cache');

const router = express.Router();

const cache = (duration) => {
    return (req, res, next) => {
        let key = '__express__' + req.originalUrl || req.url;
        let cachedBody = mcache.get(key);
        if (cachedBody) {
            res.send(cachedBody);
            return;
        } else {
            res.sendResponse = res.send;
            res.send = (body) => {
                mcache.put(key, body, duration * 1000);
                res.sendResponse(body);
            }
            next();
        }
    }
}

router.get('/',
    (req, res, next) => {
        Logger.info(`Incoming models request`, { ip: req.ip });
        next();
    },
    cache(300),
    modelsController.getModels
);

module.exports = router;