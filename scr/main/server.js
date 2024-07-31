const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const cluster = require('cluster');
const os = require('os');

const config = require('../config');
const routes = require('../routes');
const chatRoutes = require('../routes/chat');
const audioRoutes = require('../routes/audioTranscription');
const errorMiddleware = require('../middleware/errorMiddleware');
const apiKeyMiddleware = require('../middleware/apiKeyMiddleware');
const timeoutMiddleware = require('../middleware/timeoutMiddleware');
const Logger = require('../helpers/logger');
const AuthCodeManager = require('../helpers/authCodeManager');

class Server {
    constructor() {
        this.app = express();
        this.authCodeGenerator = new AuthCodeManager();
    }

    async initialize() {
        this.configureMiddleware();
        this.configureRoutes();
        this.configureErrorHandling();
        await this.authCodeGenerator.initialize();
    }

    configureMiddleware() {
        this.app.use(helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    imgSrc: ["'self'", "data:", "blob:", "https://images.prodia.xyz", "https://i.ibb.co"],
                    connectSrc: ["'self'", "https://api.prodia.com", "https://images.prodia.xyz"],
                    fontSrc: ["'self'"],
                    objectSrc: ["'none'"],
                    mediaSrc: ["'self'"],
                    frameSrc: ["'none'"],
                }
            }
        }));
        this.app.disable('x-powered-by');

        const limiter = rateLimit({
            windowMs: 15 * 60 * 1000,
            max: config.environment === 'production' ? 100 : 999,
            skip: (req) => req.url === '/v1/models' && req.method === 'GET'
        });

        this.app.use(timeoutMiddleware(300000));
        this.app.use((req, res, next) => {
            if (req.url === '/v1/models' && req.method === 'GET') {
                return next();
            }
            limiter(req, res, next);
        });
        this.app.use((req, res, next) => {
            if (req.url === '/v1/models' && req.method === 'GET') {
                return next();
            }
            apiKeyMiddleware(req, res, next);
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
        this.app.use('/v1/audio', audioRoutes);
    }

    configureErrorHandling() {
        this.app.use((req, res, next) => {
            const error = new Error('Not Found');
            error.status = 404;
            next(error);
        });
        this.app.use(errorMiddleware);
    }

    setupGracefulShutdown(server) {
        const gracefulShutdown = () => {
            Logger.info('Received kill signal, shutting down gracefully');
            server.close(() => {
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
    }

    async start() {
        await this.initialize();

        if (cluster.isMaster) {
            Logger.info(`Master ${process.pid} is running`);

            const numCPUs = os.cpus().length;
            for (let i = 0; i < numCPUs; i++) {
                cluster.fork();
            }

            cluster.on('exit', (worker, code, signal) => {
                Logger.warn(`Worker ${worker.process.pid} died`);
                cluster.fork();
            });

            this.setupAuthCodeGeneration();

        } else {
            this.startWorker();
        }
    }

    setupAuthCodeGeneration() {
        const generateAuthCodes = async () => {
            try {
                await this.authCodeGenerator.generateAuthCode();
            } catch (error) {
                Logger.error('Error generating auth code:', error);
            }
        };

        const updateGenerationRate = () => {
            const load = os.loadavg()[0] / os.cpus().length;
            const isHighLoad = load > 0.7;
            const rate = isHighLoad ? 30 : 15;
            const interval = 60000 / rate;

            if (this.authCodeInterval) {
                clearInterval(this.authCodeInterval);
            }
            this.authCodeInterval = setInterval(generateAuthCodes, interval);
        };

        updateGenerationRate();
        setInterval(updateGenerationRate, 60000)
    }

    startWorker() {
        const startServerOnPort = (port) => {
            const server = this.app.listen(port, () => {
                Logger.success(`Worker ${process.pid} running on port ${port} in ${config.environment} mode`);
            });

            server.on('error', (err) => {
                if (err.code === 'EADDRINUSE') {
                    Logger.warn(`Port ${port} is in use, trying ${port + 1}`);
                    startServerOnPort(port + 1);
                } else {
                    throw err;
                }
            });

            this.setupGracefulShutdown(server);
        };

        startServerOnPort(config.port);
    }
}

process.on('unhandledRejection', (reason, promise) => {
    Logger.error('Unhandled Rejection at:', reason);
});

process.on('uncaughtException', (error) => {
    Logger.error('Uncaught Exception:', error);
    process.exit(1);
});

const server = new Server();
server.start().catch(error => {
    Logger.error('Failed to start server:', error);
    process.exit(1);
});