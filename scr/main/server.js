const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { spawn } = require('child_process');
const cluster = require('cluster');
const os = require('os');

const config = require('../config');
const routes = require('../routes');
const chatRoutes = require('../routes/chat');
const errorMiddleware = require('../middleware/errorMiddleware');
const apiKeyMiddleware = require('../middleware/apiKeyMiddleware');
const timeoutMiddleware = require('../middleware/timeoutMiddleware');
const Logger = require('../helpers/logger');
const proxyManager = require('../helpers/proxyManager');

class Server {
    constructor() {
        this.app = express();
        this.cfClearanceScraperProcess = null;
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

                await this.initializeProxyManager();
                
                if (config.useCFClearanceScraper) {
                    Logger.info('Starting CF Clearance Scraper...');
                    await this.startCFClearanceScraper();
                    Logger.success('Server and CF Clearance Scraper are fully operational');
                } else {
                    Logger.info('CF Clearance Scraper is disabled');
                    Logger.success('Server is fully operational');
                }
            } else {
                this.server = this.app.listen(config.port, () => {
                    Logger.success(`Worker ${process.pid} running on port ${config.port} in ${config.environment} mode`);
                });

                this.setupGracefulShutdown();
            }
        } catch (error) {
            Logger.error('Failed to start server:', error);
            process.exit(1);
        }
    }    

    async initializeProxyManager() {
        try {
            await proxyManager.initialize();
            Logger.success('Proxy manager initialized successfully');
        } catch (error) {
            Logger.error('Failed to initialize proxy manager:', error);
        }
    }

    async startCFClearanceScraper() {
        if (!config.useCFClearanceScraper) {
            Logger.info('CF Clearance Scraper is disabled. Skipping start.');
            return;
        }

        return new Promise((resolve, reject) => {
            try {
                const scraperPath = path.resolve(__dirname, '../../cf-clearance-scraper');
                Logger.info(`Starting CF Clearance Scraper from ${scraperPath}`);
    
                this.cfClearanceScraperProcess = spawn('npm', ['run', 'start'], {
                    cwd: scraperPath,
                    stdio: ['ignore', 'pipe', 'pipe'],
                    shell: true
                });
    
                Logger.info('CF Clearance Scraper process spawned');
    
                let isResolved = false;
    
                this.cfClearanceScraperProcess.stdout.on('data', (data) => {
                    const output = data.toString();
                    Logger.info(`CF Clearance Scraper stdout: ${output}`);
                    if (output.includes('Server running on port') && !isResolved) {
                        isResolved = true;
                        resolve();
                    }
                });
    
                this.cfClearanceScraperProcess.stderr.on('data', (data) => {
                    const errorOutput = data.toString();
                    Logger.error(`CF Clearance Scraper stderr: ${errorOutput}`);
                });
    
                this.cfClearanceScraperProcess.on('error', (error) => {
                    Logger.error('Failed to start CF Clearance Scraper process:', error);
                    if (!isResolved) {
                        isResolved = true;
                        reject(error);
                    }
                });
    
                this.cfClearanceScraperProcess.on('close', (code) => {
                    Logger.info(`CF Clearance Scraper process exited with code ${code}`);
                    if (code !== 0 && !isResolved) {
                        isResolved = true;
                        reject(new Error(`CF Clearance Scraper exited with code ${code}`));
                    }
                });
    
            } catch (error) {
                Logger.error('Error in startCFClearanceScraper:', error);
                reject(error);
            }
        });
    }

    setupGracefulShutdown() {
        const gracefulShutdown = () => {
            Logger.info('Received kill signal, shutting down gracefully');
            if (proxyManager.isInitialized()) {
                proxyManager.stopPeriodicUpdate();
            }
            if (this.cfClearanceScraperProcess && config.useCFClearanceScraper) {
                this.cfClearanceScraperProcess.kill();
            }
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

if (cluster.isMaster) {
    const server = new Server();
    server.start();
} else {
    const server = new Server();
    server.start();
}
