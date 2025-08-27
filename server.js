const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
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
        // Serve static files from public directory
        this.app.use(express.static('public'));
        
        // Body parsing middleware
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

        // Setup multer for image uploads
        const storage = multer.diskStorage({
            destination: (req, file, cb) => {
                const uploadDir = './uploads';
                if (!fs.existsSync(uploadDir)) {
                    fs.mkdirSync(uploadDir, { recursive: true });
                }
                cb(null, uploadDir);
            },
            filename: (req, file, cb) => {
                const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
                cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
            }
        });

        this.upload = multer({ 
            storage: storage,
            limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
            fileFilter: (req, file, cb) => {
                if (file.mimetype.startsWith('image/')) {
                    cb(null, true);
                } else {
                    cb(new Error('Only image files are allowed!'), false);
                }
            }
        });

        // Request logging middleware
        this.app.use((req, res, next) => {
            const startTime = Date.now();
            res.on('finish', () => {
                const responseTime = Date.now() - startTime;
                logger.logRequest(req, res, responseTime);
            });
            next();
        });

        // Authorization middleware for protected routes
        this.authMiddleware = (req, res, next) => {
            const authHeader = req.headers.authorization;
            const userIdFromHeader = req.headers['x-user-id'];
            
            // Check if user ID is provided and matches authorized user
            if (!userIdFromHeader || userIdFromHeader !== config.authorizedUserId) {
                logger.warn(`Unauthorized access attempt from user ID: ${userIdFromHeader || 'not provided'}`);
                return res.status(403).json({
                    success: false,
                    error: 'Access denied. Only authorized user can perform this action.',
                    timestamp: new Date().toISOString()
                });
            }
            
            next();
        };

        // CORS middleware
        this.app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
            res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-User-ID');

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
        // Root endpoint - BitVault Pro API info
        this.app.get('/', (req, res) => {
            const botStatus = getStatus();
            res.json({
                success: true,
                service: 'BitVault Pro Telegram Bot API',
                version: '1.0.0',
                status: 'operational',
                endpoints: {
                    health: '/health',
                    status: '/status',
                    broadcast: 'POST /broadcast (protected)',
                    customBroadcast: 'POST /custom-broadcast (protected, supports image upload)',
                    dailySummary: 'POST /daily-summary (protected)',
                    schedule: 'POST /schedule (protected)',
                    logs: '/logs',
                    samples: '/samples'
                },
                security: {
                    protectedEndpoints: 'Require X-User-ID header with authorized user ID',
                    authorizedUserId: config.authorizedUserId
                },
                bot: {
                    connected: botStatus.isConnected,
                    username: botStatus.username
                },
                timestamp: new Date().toISOString()
            });
        });

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

        // Broadcast message endpoint (protected)
        this.app.post('/broadcast', this.authMiddleware, async (req, res) => {
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

        // Send daily market summary endpoint (protected)
        this.app.post('/daily-summary', this.authMiddleware, async (req, res) => {
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

        // Schedule custom message endpoint (protected)
        this.app.post('/schedule', this.authMiddleware, async (req, res) => {
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

        // Custom broadcast with image endpoint (protected)
        this.app.post('/custom-broadcast', this.authMiddleware, this.upload.single('image'), async (req, res) => {
            try {
                const { message, caption } = req.body;
                const imageFile = req.file;

                if (!message && !imageFile) {
                    return res.status(400).json({
                        success: false,
                        error: 'Either message or image is required',
                        timestamp: new Date().toISOString()
                    });
                }

                let result;
                if (imageFile && message) {
                    // Send image with caption
                    result = await this.sendImageWithCaption(imageFile.path, message);
                } else if (imageFile) {
                    // Send image only with optional caption
                    result = await this.sendImageWithCaption(imageFile.path, caption || '');
                } else {
                    // Send text message only
                    result = await broadcastUpdate(message);
                }

                // Clean up uploaded file
                if (imageFile && fs.existsSync(imageFile.path)) {
                    fs.unlinkSync(imageFile.path);
                }

                res.json({
                    success: true,
                    data: result,
                    timestamp: new Date().toISOString()
                });

            } catch (error) {
                logger.error('Custom broadcast API error:', error.message);
                
                // Clean up uploaded file on error
                if (req.file && fs.existsSync(req.file.path)) {
                    fs.unlinkSync(req.file.path);
                }
                
                res.status(500).json({
                    success: false,
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        });

        // Stop scheduled job endpoint
        this.app.delete('/schedule/:name', this.authMiddleware, async (req, res) => {
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
     * Send image with caption to channel
     */
    async sendImageWithCaption(imagePath, caption = '') {
        try {
            const { bot } = require('./bot');
            
            const result = await bot.sendPhoto(config.channelId, imagePath, {
                caption: caption,
                parse_mode: 'Markdown'
            });
            
            logger.info(`Image sent successfully to channel (message_id: ${result.message_id})`);
            return {
                success: true,
                messageId: result.message_id,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            logger.error('Failed to send image:', error.message);
            throw new Error(`Failed to send image: ${error.message}`);
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