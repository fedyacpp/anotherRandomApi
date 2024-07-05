const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const config = require('../config');
const routes = require('../routes');
const chatRoutes = require('../routes/chat');
const errorMiddleware = require('../middleware/errorMiddleware');
const apiKeyMiddleware = require('../middleware/apiKeyMiddleware');
const timeoutMiddleware = require('../middleware/timeoutMiddleware');
const Logger = require('../helpers/logger');
const path = require('path');
const proxyManager = require('../helpers/proxyManager');

class Server {
    constructor() {
        this.app = express();
        this.configureMiddleware();
        this.configureRoutes();
        this.configureErrorHandling();
    }

    configureMiddleware() {
        this.app.use(helmet());
        this.app.disable('x-powered-by');

        const limiter = rateLimit({
            windowMs: 15 * 60 * 1000,
            max: config.environment === 'production' ? 100 : 999,
            skip: (req) => req.url === '/v1/models' && req.method === 'GET'
        });

        this.app.use(timeoutMiddleware(30000));

        this.app.use((req, res, next) => {
            if (req.url === '/v1/models' && req.method === 'GET') {
                return next();
            }
            limiter(req, res, (err) => {
                if (err) return next(err);
                apiKeyMiddleware(req, res, next);
            });
        });

        const jsonLimit = config.environment === 'production' ? '50mb' : '100mb';
        this.app.use(express.json({ limit: jsonLimit }));
        this.app.use(express.urlencoded({ limit: jsonLimit, extended: true }));

        this.app.use(express.static(path.join(__dirname, '../public'), { maxAge: '1d' }));

        this.app.use((req, res, next) => {
            Logger.info(`${req.method} ${req.url}`, { ip: req.ip, userAgent: req.get('User-Agent') });
            next();
        });
    }

    configureRoutes() {
        this.app.use('/v1', routes);
        this.app.use('/test', chatRoutes);
    }

    configureErrorHandling() {
        this.app.use((req, res, next) => {
            const error = new Error('Not Found');
            error.status = 404;
            next(error);
        });

        this.app.use(errorMiddleware);
    }

    async start() {
        try {
            await proxyManager.initialize();
            
            this.server = this.app.listen(config.port, () => {
                Logger.success(`Server running on port ${config.port} in ${config.environment} mode`);
            });

            this.setupGracefulShutdown();
        } catch (error) {
            Logger.error('Failed to start server:', error);
            process.exit(1);
        }
    }

    setupGracefulShutdown() {
        const gracefulShutdown = () => {
            Logger.info('Received kill signal, shutting down gracefully');
            proxyManager.stopPeriodicUpdate();
            this.server.close(() => {
                Logger.info('Closed out remaining connections');
                process.exit(0);
            });

            setTimeout(() => {
                Logger.error('Could not close connections in time, forcefully shutting down');
                process.exit(1);
            }, 10000);
        };
        process.on('SIGTERM', gracefulShutdown);
        process.on('SIGINT', gracefulShutdown);

        process.on('unhandledRejection', (reason, promise) => {
            Logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
        });

        process.on('uncaughtException', (error) => {
            Logger.error('Uncaught Exception:', error);
            gracefulShutdown();
        });
    }
}

const server = new Server();
server.start();