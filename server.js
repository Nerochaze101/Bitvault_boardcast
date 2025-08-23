const express = require('express');
const { bot, broadcastUpdate, sendDailyMarketSummary, initialize, getStatus } = require('./bot');
const { start: startScheduler, getStatus: getSchedulerStatus, scheduleCustomMessage, stopJob } = require('./scheduler');
const config = require('./config');
const logger = require('./logger');

class BitVaultBotServer {
    constructor() {
        this.app = express();
        this.server = null;
        this.isRunning = false;
    }

    /**
     * Setup Express middleware
     */
    setupMiddleware() {
        // Body parsing middleware
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

        // Request logging middleware
        this.app.use((req, res, next) => {
            const startTime = Date.now();
            res.on('finish', () => {
                const responseTime = Date.now() - startTime;
                logger.logRequest(req, res, responseTime);
            });
            next();
        });

        // CORS middleware
        this.app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
            res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

            if (req.method === 'OPTIONS') {
                res.sendStatus(200);
            } else {
                next();
            }
        });
    }

    /**
     * Setup API routes
     */
    setupRoutes() {
        // Health check endpoint
        this.app.get('/health', (req, res) => {
            const botStatus = getStatus();
            const schedulerStatus = getSchedulerStatus();

            res.json({
                success: true,
                status: 'healthy',
                timestamp: new Date().toISOString(),
                bot: botStatus,
                scheduler: schedulerStatus,
                uptime: process.uptime()
            });
        });

        // Status endpoint
        this.app.get('/status', (req, res) => {
            const botStatus = getStatus();
            const schedulerStatus = getSchedulerStatus();

            res.json({
                success: true,
                data: {
                    bot: botStatus,
                    scheduler: schedulerStatus,
                    server: {
                        isRunning: this.isRunning,
                        port: config.port,
                        host: config.host,
                        uptime: process.uptime()
                    }
                },
                timestamp: new Date().toISOString()
            });
        });

        // Broadcast message endpoint
        this.app.post('/broadcast', async (req, res) => {
            try {
                const { message } = req.body;

                if (!message) {
                    return res.status(400).json({
                        success: false,
                        error: 'Message is required',
                        timestamp: new Date().toISOString()
                    });
                }

                const result = await broadcastUpdate(message);

                res.json({
                    success: true,
                    data: result,
                    timestamp: new Date().toISOString()
                });

            } catch (error) {
                logger.error('Broadcast API error:', error.message);
                res.status(500).json({
                    success: false,
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        });

        // Send daily market summary endpoint
        this.app.post('/daily-summary', async (req, res) => {
            try {
                const result = await sendDailyMarketSummary();

                res.json({
                    success: true,
                    data: result,
                    timestamp: new Date().toISOString()
                });

            } catch (error) {
                logger.error('Daily summary API error:', error.message);
                res.status(500).json({
                    success: false,
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        });

        // Schedule custom message endpoint
        this.app.post('/schedule', async (req, res) => {
            try {
                const { name, cronExpression, message, options = {} } = req.body;

                if (!name || !cronExpression || !message) {
                    return res.status(400).json({
                        success: false,
                        error: 'Name, cronExpression, and message are required',
                        timestamp: new Date().toISOString()
                    });
                }

                scheduleCustomMessage(name, cronExpression, message, options);

                res.json({
                    success: true,
                    data: { name, cronExpression, scheduled: true },
                    timestamp: new Date().toISOString()
                });

            } catch (error) {
                logger.error('Schedule API error:', error.message);
                res.status(400).json({
                    success: false,
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        });

        // Stop scheduled job endpoint
        this.app.delete('/schedule/:name', async (req, res) => {
            try {
                const { name } = req.params;
                const stopped = stopJob(name);

                if (stopped) {
                    res.json({
                        success: true,
                        data: { name, stopped: true },
                        timestamp: new Date().toISOString()
                    });
                } else {
                    res.status(404).json({
                        success: false,
                        error: `Scheduled job '${name}' not found`,
                        timestamp: new Date().toISOString()
                    });
                }

            } catch (error) {
                logger.error('Stop schedule API error:', error.message);
                res.status(500).json({
                    success: false,
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        });

        // Get recent logs endpoint
        this.app.get('/logs', (req, res) => {
            try {
                const lines = parseInt(req.query.lines) || 100;
                const logs = logger.getRecentLogs(lines);

                res.json({
                    success: true,
                    data: { logs, count: logs.length },
                    timestamp: new Date().toISOString()
                });

            } catch (error) {
                logger.error('Logs API error:', error.message);
                res.status(500).json({
                    success: false,
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        });

        // Sample BitVault Pro messages endpoint
        this.app.get('/samples', (req, res) => {
            const samples = [
                {
                    name: "profit_distribution",
                    message: "🚀 *BitVault Pro Update*: Automated profits distributed! 💰\n\n✅ All active investments received their returns\n📊 Check your dashboard for updated balances\n🔄 Compound interest automatically applied\n\n*Your Bitcoin is growing 24/7!* 📈"
                },
                {
                    name: "security_update",
                    message: "🔒 *Security Update*: BitVault Pro systems secured! 🛡️\n\n✅ All funds safely stored in cold wallets\n🔐 Multi-layer encryption active\n🚨 24/7 monitoring operational\n\n*Your investments are protected!* 💎"
                },
                {
                    name: "market_analysis",
                    message: "📊 *Market Analysis*: Bitcoin showing strong momentum! 📈\n\n🪙 *BTC Price*: Trending upward\n📈 *Technical Indicators*: Bullish signals\n💰 *BitVault Returns*: Outperforming market\n\n*Perfect time to maximize your portfolio!* 🚀"
                },
                {
                    name: "weekly_summary",
                    message: "📅 *Weekly BitVault Pro Summary*\n\n💰 *Total Returns*: Exceeding expectations\n🔄 *Reinvestments*: Automatically processed\n📊 *Portfolio Growth*: Steady upward trend\n🎯 *Success Rate*: 98.5% satisfaction\n\n*Join thousands of successful investors!* 🌟"
                }
            ];

            res.json({
                success: true,
                data: { samples },
                timestamp: new Date().toISOString()
            });
        });

        // Error handling middleware (last)
        this.app.use((err, req, res, next) => {
            logger.error('Express error:', err.stack || err.message);
            res.status(500).json({
                success: false,
                error: 'Internal server error',
                timestamp: new Date().toISOString()
            });
        });
    }

    /**
     * Start the server
     */
    async start() {
        try {
            // Validate configuration
            config.validate();
            config.log();

            // Initialize bot
            try {
                await initialize();
                logger.info("Telegram bot initialized successfully");
            } catch (err) {
                logger.error(`Bot initialization failed: ${err.message}`);
                if (err.stack) logger.error(err.stack);
                throw err;
            }

            // Start scheduler if enabled
            if (config.enableScheduler) {
                startScheduler();
            }

            // Setup Express app if API is enabled
            if (config.enableApi) {
                this.setupMiddleware();
                this.setupRoutes();

                // Start HTTP server
                this.server = this.app.listen(process.env.PORT || 5000, '0.0.0.0', () => {
                    logger.info(`BitVault Bot Server started on http://0.0.0.0:${process.env.PORT || 5000}`);
                });

                this.server.on('error', (error) => {
                    logger.error('Server error:', error.message);
                    throw error;
                });
            }

            this.isRunning = true;
            logger.info('BitVault Telegram Bot service started successfully');

            return true;
        } catch (error) {
            logger.error('Failed to start server:', error.message);
            if (error.stack) logger.error(error.stack);
            throw error;
        }
    }

    /**
     * Stop the server
     */
    async stop() {
        try {
            if (this.server) {
                this.server.close();
                logger.info('HTTP server stopped');
            }

            this.isRunning = false;
            logger.info('BitVault Bot Server stopped');

        } catch (error) {
            logger.error('Error stopping server:', error.message);
            if (error.stack) logger.error(error.stack);
            throw error;
        }
    }
}

// Create server instance
const server = new BitVaultBotServer();

// Handle process signals for graceful shutdown
process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down gracefully...');
    await server.stop();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down gracefully...');
    await server.stop();
    process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception:', error.stack || error.message);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled promise rejection:', reason);
    process.exit(1);
});

// Start server if this file is run directly
if (require.main === module) {
    server.start().catch((error) => {
        logger.error('Failed to start application:', error.message);
        if (error.stack) logger.error(error.stack);
        process.exit(1);
    });
}

module.exports = { server, broadcastUpdate, sendDailyMarketSummary };