const express = require('express');
const config = require('../config');
const routes = require('../routes');
const chatRoutes = require('../routes/chat');
const errorMiddleware = require('../middleware/errorMiddleware');
const Logger = require('../helpers/logger');
const path = require('path');

const app = express();

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.use(express.static(path.join(__dirname, '../public')));

app.use((req, res, next) => {
    Logger.info(`Incoming ${req.method} request to ${req.url}`);
    next();
});

app.use('/v1', routes);

app.use('/test', chatRoutes);

app.use(errorMiddleware);

app.use((req, res, next) => {
    const error = new Error('Not Found');
    error.name = 'NotFoundError';
    error.status = 404;
    next(error);
});

const server = app.listen(config.port, () => {
    Logger.success(`Server running on port ${config.port} in ${config.environment} mode`);
});

process.on('unhandledRejection', (reason, promise) => {
    Logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    Logger.error('Uncaught Exception:', error);
    server.close(() => {
        process.exit(1);
    });
});