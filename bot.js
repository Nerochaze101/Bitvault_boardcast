const TelegramBot = require('node-telegram-bot-api');
const config = require('./config');
const logger = require('./logger');

class BitVaultTelegramBot {
    constructor() {
        this.bot = null;
        this.isInitialized = false;
        this.retryCount = 3;
        this.retryDelay = 2000; // 2 seconds
    }

    /**
     * Initialize the Telegram bot
     */
    async initialize() {
        try {
            if (!config.botToken) {
                throw new Error('BOT_TOKEN is required');
            }

            if (!config.channelId) {
                throw new Error('CHANNEL_ID is required');
            }

            this.bot = new TelegramBot(config.botToken, { polling: false });
            
            // Test the bot connection
            const botInfo = await this.bot.getMe();
            logger.info(`Bot initialized successfully: @${botInfo.username}`);
            
            // Attempt to verify channel access (non-blocking)
            try {
                await this.verifyChannelAccess();
            } catch (error) {
                logger.warn(`Channel verification failed, but bot will continue: ${error.message}`);
                logger.warn(`To enable broadcasting, add @${botInfo.username} to ${config.channelId} as an admin`);
            }
            
            this.isInitialized = true;
            return true;
        } catch (error) {
            logger.error('Failed to initialize bot:', error.message);
            throw error;
        }
    }

    /**
     * Verify that the bot has access to the channel
     */
    async verifyChannelAccess() {
        try {
            const chat = await this.bot.getChat(config.channelId);
            logger.info(`Channel access verified: ${chat.title || chat.username}`);
            return true;
        } catch (error) {
            if (error.response && error.response.body) {
                try {
                    const errorData = typeof error.response.body === 'string' 
                        ? JSON.parse(error.response.body) 
                        : error.response.body;
                    
                    if (errorData.error_code === 400) {
                        throw new Error(`Invalid CHANNEL_ID: ${config.channelId}. Make sure the bot is added to the channel as an admin.`);
                    } else if (errorData.error_code === 403) {
                        throw new Error(`Bot doesn't have permission to access channel: ${config.channelId}. Add the bot as an admin.`);
                    }
                } catch (parseError) {
                    logger.warn('Failed to parse Telegram API error response:', parseError.message);
                }
            }
            throw new Error(`Channel verification failed: ${error.message}`);
        }
    }

    /**
     * Send a message with retry mechanism
     */
    async sendMessageWithRetry(message, options = {}, attempt = 1) {
        try {
            const result = await this.bot.sendMessage(config.channelId, message, {
                parse_mode: 'Markdown',
                disable_web_page_preview: true,
                ...options
            });
            
            logger.info(`Message sent successfully to channel (message_id: ${result.message_id})`);
            return result;
        } catch (error) {
            logger.warn(`Attempt ${attempt} failed:`, error.message);
            
            if (attempt < this.retryCount) {
                logger.info(`Retrying in ${this.retryDelay}ms... (attempt ${attempt + 1}/${this.retryCount})`);
                await this.delay(this.retryDelay);
                return this.sendMessageWithRetry(message, options, attempt + 1);
            }
            
            throw error;
        }
    }

    /**
     * Broadcast update message to the channel
     */
    async broadcastUpdate(message) {
        if (!this.isInitialized) {
            throw new Error('Bot not initialized. Call initialize() first.');
        }

        if (!message || typeof message !== 'string') {
            throw new Error('Message must be a non-empty string');
        }

        try {
            logger.info('Broadcasting update message...');
            const result = await this.sendMessageWithRetry(message);
            
            logger.info('Broadcast successful');
            return {
                success: true,
                messageId: result.message_id,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            logger.error('Broadcast failed:', error.message);
            
            // Handle specific Telegram API errors
            if (error.response && error.response.body) {
                try {
                    const errorData = typeof error.response.body === 'string' 
                        ? JSON.parse(error.response.body) 
                        : error.response.body;
                    const errorCode = errorData.error_code;
                    const errorDescription = errorData.description;
                    
                    switch (errorCode) {
                        case 400:
                            throw new Error(`Bad Request: ${errorDescription}`);
                        case 403:
                            throw new Error(`Forbidden: Bot lacks permission. ${errorDescription}`);
                        case 429:
                            throw new Error(`Rate Limited: Too many requests. ${errorDescription}`);
                        case 502:
                        case 503:
                        case 504:
                            throw new Error(`Telegram API temporarily unavailable: ${errorDescription}`);
                        default:
                            throw new Error(`Telegram API Error (${errorCode}): ${errorDescription}`);
                    }
                } catch (parseError) {
                    logger.warn('Failed to parse Telegram API error response:', parseError.message);
                }
            }
            
            throw new Error(`Failed to broadcast message: ${error.message}`);
        }
    }

    /**
     * Send daily Bitcoin market summary
     */
    async sendDailyMarketSummary() {
        try {
            // Get current Bitcoin price (you can replace this with actual API call)
            const bitcoinPrice = await this.getBitcoinPrice();
            
            const marketSummary = `📊 *Daily Bitcoin Market Update*

🪙 *Current BTC Price*: $${bitcoinPrice.toLocaleString()}
📈 *24h Change*: ${bitcoinPrice > 50000 ? '+2.5%' : '-1.2%'}
💎 *Market Cap*: $${(bitcoinPrice * 19.5).toLocaleString()}M

🚀 *BitVault Pro Status*:
✅ All systems operational
💰 Automated profits distributed
🔒 Funds secured in cold storage

*Ready to maximize your Bitcoin returns?*
Join BitVault Pro today! 🎯`;

            return await this.broadcastUpdate(marketSummary);
        } catch (error) {
            logger.error('Failed to send daily market summary:', error.message);
            throw error;
        }
    }

    /**
     * Get Bitcoin price (mock implementation - replace with real API)
     */
    async getBitcoinPrice() {
        try {
            // In production, use a real API like CoinGecko or CoinMarketCap
            // For now, return a realistic value
            const basePrice = 45000;
            const variation = (Math.random() - 0.5) * 10000; // ±$5000 variation
            return Math.round(basePrice + variation);
        } catch (error) {
            logger.warn('Failed to fetch Bitcoin price, using fallback');
            return 50000; // Fallback price
        }
    }

    /**
     * Utility method for delays
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get bot status
     */
    getStatus() {
        return {
            initialized: this.isInitialized,
            botToken: config.botToken ? '***' + config.botToken.slice(-4) : null,
            channelId: config.channelId,
            timestamp: new Date().toISOString()
        };
    }
}

// Create and export singleton instance
const botInstance = new BitVaultTelegramBot();

module.exports = {
    bot: botInstance,
    broadcastUpdate: async (message) => {
        return await botInstance.broadcastUpdate(message);
    },
    sendDailyMarketSummary: async () => {
        return await botInstance.sendDailyMarketSummary();
    },
    initialize: async () => {
        return await botInstance.initialize();
    },
    getStatus: () => {
        return botInstance.getStatus();
    }
};
