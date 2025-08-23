const dotenv = require('dotenv');
const logger = require('./logger');

// Load environment variables
dotenv.config();

/**
 * Configuration object with validation
 */
const config = {
    // Telegram Bot Configuration
    botToken: process.env.BOT_TOKEN,
    channelId: process.env.CHANNEL_ID,
    
    // Scheduler Configuration
    dailyUpdateTime: process.env.DAILY_UPDATE_TIME || '0 9 * * *', // 9:00 AM daily
    timezone: process.env.TIMEZONE || 'UTC',
    
    // API Configuration
    port: parseInt(process.env.PORT) || 5000,
    host: process.env.HOST || '0.0.0.0',
    
    // Logging Configuration
    logLevel: process.env.LOG_LEVEL || 'info',
    
    // Bot Behavior Configuration
    retryAttempts: parseInt(process.env.RETRY_ATTEMPTS) || 3,
    retryDelay: parseInt(process.env.RETRY_DELAY) || 2000,
    
    // Feature Flags
    enableScheduler: process.env.ENABLE_SCHEDULER !== 'false',
    enableApi: process.env.ENABLE_API !== 'false'
};

/**
 * Validate required configuration
 */
function validateConfig() {
    const required = ['botToken', 'channelId'];
    const missing = required.filter(key => !config[key]);
    
    if (missing.length > 0) {
        const error = `Missing required environment variables: ${missing.join(', ')}`;
        logger.error(error);
        throw new Error(error);
    }
    
    // Normalize and validate channel ID format
    if (config.channelId) {
        logger.info(`Channel ID received: "${config.channelId}"`);
        
        // Handle full Telegram URLs by extracting channel name
        if (config.channelId.startsWith('https://t.me/')) {
            const channelName = config.channelId.replace('https://t.me/', '');
            config.channelId = '@' + channelName;
            logger.info(`Converted URL to channel ID: "${config.channelId}"`);
        }
        
        // Validate final format
        if (!config.channelId.match(/^@[A-Za-z0-9_]+$|^-?\d+$/)) {
            const error = `CHANNEL_ID must be a valid Telegram channel ID (e.g., @channel_name or -1001234567890). Received: "${config.channelId}"`;
            logger.error(error);
            throw new Error(error);
        }
    }
    
    logger.info('Configuration validated successfully');
    return true;
}

/**
 * Log configuration (without sensitive data)
 */
function logConfig() {
    const safeConfig = {
        ...config,
        botToken: config.botToken ? '***' + config.botToken.slice(-4) : null
    };
    
    logger.info('Current configuration:', safeConfig);
}

module.exports = {
    ...config,
    validate: validateConfig,
    log: logConfig
};
