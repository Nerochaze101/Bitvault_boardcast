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

            this.bot = new TelegramBot(config.botToken, { polling: config.enableCommands });
            
            // Set up command handlers if enabled
            if (config.enableCommands) {
                this.setupCommandHandlers();
            }
            
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
     * Setup command handlers for the bot
     */
    setupCommandHandlers() {
        // Helper function to check if user is authorized
        const isAuthorized = (userId) => {
            if (!config.authorizedUserId) {
                logger.warn('CHAT_ID not set - allowing all users');
                return true;
            }
            return userId.toString() === config.authorizedUserId.toString();
        };

        // Command to trigger daily market summary
        this.bot.onText(/\/broadcast_daily/, async (msg) => {
            const chatId = msg.chat.id;
            const userId = msg.from.id;
            const username = msg.from.username || msg.from.first_name;
            
            logger.info(`Broadcast daily command received from user: ${username} (${userId})`);
            
            // Check authorization
            if (!isAuthorized(userId)) {
                logger.warn(`Unauthorized access attempt from user: ${username} (${userId})`);
                await this.bot.sendMessage(chatId, '❌ You are not authorized to use this bot.');
                return;
            }
            
            try {
                // Send "thinking" message
                await this.bot.sendMessage(chatId, '🔄 Preparing daily market summary...');
                
                // Send the daily market summary
                const result = await this.sendDailyMarketSummary();
                
                // Confirm success to the user
                await this.bot.sendMessage(chatId, `✅ Daily market summary sent successfully!\n\nMessage ID: ${result.messageId}\nTime: ${result.timestamp}`);
                
            } catch (error) {
                logger.error(`Failed to send daily summary via command: ${error.message}`);
                await this.bot.sendMessage(chatId, `❌ Failed to send broadcast: ${error.message}`);
            }
        });

        // Command to send custom broadcast message
        this.bot.onText(/\/broadcast (.+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const userId = msg.from.id;
            const username = msg.from.username || msg.from.first_name;
            const customMessage = match[1];
            
            logger.info(`Custom broadcast command received from user: ${username} (${userId})`);
            
            // Check authorization
            if (!isAuthorized(userId)) {
                logger.warn(`Unauthorized access attempt from user: ${username} (${userId})`);
                await this.bot.sendMessage(chatId, '❌ You are not authorized to use this bot.');
                return;
            }
            
            try {
                // Send "thinking" message
                await this.bot.sendMessage(chatId, '🔄 Sending custom broadcast...');
                
                // Send the custom message
                const result = await this.broadcastUpdate(customMessage);
                
                // Confirm success to the user
                await this.bot.sendMessage(chatId, `✅ Custom broadcast sent successfully!\n\nMessage ID: ${result.messageId}\nTime: ${result.timestamp}`);
                
            } catch (error) {
                logger.error(`Failed to send custom broadcast via command: ${error.message}`);
                await this.bot.sendMessage(chatId, `❌ Failed to send broadcast: ${error.message}`);
            }
        });

        // Help command
        this.bot.onText(/\/start|\/help/, async (msg) => {
            const chatId = msg.chat.id;
            const userId = msg.from.id;
            const username = msg.from.username || msg.from.first_name;
            
            logger.info(`Help/Start command from user: ${username} (${userId})`);
            
            if (!isAuthorized(userId)) {
                const unauthorizedMessage = `🤖 *BitVault Pro Bot*

❌ You are not authorized to use this bot.

Your User ID: \`${userId}\`
Contact the bot owner to get access.`;
                await this.bot.sendMessage(chatId, unauthorizedMessage, { parse_mode: 'Markdown' });
                return;
            }
            
            const helpMessage = `🤖 *BitVault Pro Bot Commands*

✅ You are authorized to use this bot!
Your User ID: \`${userId}\`

Available commands:
• \`/broadcast_daily\` - Send daily market summary
• \`/broadcast <message>\` - Send custom broadcast message
• \`/help\` - Show this help message

*Usage Examples:*
• \`/broadcast_daily\`
• \`/broadcast 🚀 Special announcement: New feature launched!\`

Send me any of these commands and I'll broadcast to the channel!`;

            await this.bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
        });

        // Handle any errors from polling
        this.bot.on('polling_error', (error) => {
            logger.error('Telegram polling error:', error.message);
        });

        logger.info('Command handlers set up successfully');
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
     * Send professional daily market summary with varied content
     */
    async sendDailyMarketSummary() {
        try {
            // Get real-time Bitcoin market data
            const marketData = await this.getBitcoinPrice();
            
            // Generate varied professional content
            const summary = this.generateDailyMessage(marketData);
            
            logger.info('Sending daily professional market summary...');
            return await this.broadcastUpdate(summary);
        } catch (error) {
            logger.error('Failed to send daily market summary:', error.message);
            throw error;
        }
    }

    /**
     * Generate animated professional daily messages with progressive market cap
     */
    generateDailyMessage(marketData) {
        const { price, change24h, marketCap } = marketData;
        const changeIcon = parseFloat(change24h) >= 0 ? '📈' : '📉';
        const changeText = parseFloat(change24h) >= 0 ? '+' + change24h : change24h;
        const priceFormatted = price.toLocaleString();
        
        // Progressive market cap that grows over time (realistic growth trend)
        const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
        const baseMarketCap = 950; // Base $950B
        const growthFactor = 1 + (dayOfYear * 0.001); // Small daily growth
        const progressiveMarketCap = Math.round((marketCap || baseMarketCap) * growthFactor);
        
        // Use current timestamp to rotate through different message styles each broadcast
        const messageType = Math.floor(Date.now() / 1000) % 12; // 12 different rotating styles
        
        // Animation elements and effects
        const sparkles = '✨'.repeat(3);
        const arrows = '🔥'.repeat(2);
        const diamonds = '💎'.repeat(2);
        const rockets = '🚀'.repeat(2);
        
        const messages = [
            // Motivational Bitcoin Update
            `${rockets} *Bitcoin is Moving!* ${rockets}

🪙 *BTC Price*: $${priceFormatted} ${changeIcon} ${changeText}%

${sparkles} *Your Bitcoin Deserves Better!*
Don't let it sit idle while opportunities pass by!

✅ BitVault Pro is working 24/7 for you
💰 Daily profits automatically generated  
🔄 Smart reinvestment maximizing growth
🔒 Your funds = 100% secure

${diamonds} *Why Wait?* ${diamonds}
Every day you delay is money left on the table.
Smart investors are already earning daily returns!

*Ready to turn your Bitcoin into a profit machine?*
*Join the winning team at BitVault Pro!* 🏆`,

            // Good Morning Success
            `🌅 *Good Morning, Winners!* 

🪙 *Bitcoin*: $${priceFormatted} ${changeIcon} ${changeText}%

${sparkles} *While You Slept, We Worked!*
Your BitVault Pro account was busy making profits!

✅ Overnight trading: SUCCESS
💰 Profits calculated: DONE
🔄 Auto-reinvestment: ACTIVE
${changeIcon} Portfolio growth: CONTINUOUS

*Wake up richer than yesterday!*
*That's the BitVault Pro promise!* ${rockets}`,

            // Daily Motivation
            `${rockets} *Your Bitcoin Success Story Starts NOW!* 

💰 *BTC Today*: $${priceFormatted} ${changeIcon} ${changeText}%

${diamonds} *Stop Settling for Less!*
Your Bitcoin is just sitting there... doing NOTHING!

🔥 BitVault Pro = Daily Profits
⚡ Smart algorithms = Real returns
🎯 Your success = Our mission

*Every day you wait is money you LOSE!*
*Smart investors choose BitVault Pro!* 💎`,

            // Opportunity Alert
            `⚡ *OPPORTUNITY ALERT!* 

🪙 *Bitcoin Moving*: $${priceFormatted} ${changeIcon} ${changeText}%

${sparkles} *Perfect Time to ACT!*
${parseFloat(change24h) >= 0 ? 'Bitcoin is rising - maximize your gains!' : 'Bitcoin dip = buying opportunity!'}

✅ Auto-trading: ACTIVE
💰 Daily returns: GUARANTEED  
🚀 Growth potential: UNLIMITED
🔒 Your funds: 100% SAFE

*Don't watch from the sidelines!*
*Join the profit party at BitVault Pro!* 🎉`,

            // Success Focus
            `🏆 *SUCCESS IS A CHOICE!*

💰 *Bitcoin*: $${priceFormatted} ${changeIcon} ${changeText}%

${diamonds} *Choose to WIN with BitVault Pro!*

📈 Daily profits = REAL
🔄 Compound growth = POWERFUL
⚡ Smart trading = 24/7
💎 Your future = BRIGHT

*Successful people don't wait - they ACT!*
*Make your Bitcoin work as hard as you do!* ${rockets}`,

            // Action Call
            `🔥 *STOP MISSING OUT!*

🪙 *BTC Price*: $${priceFormatted} ${changeIcon} ${changeText}%

${sparkles} *Your Bitcoin Could Be Earning RIGHT NOW!*

✅ While others hold - you PROFIT
💰 While others wait - you EARN
🚀 While others dream - you ACHIEVE

*Every second counts in crypto!*
*BitVault Pro: Where Bitcoin becomes INCOME!* 💸`,

            // Weekend Vibes  
            `🎉 *Weekend Bitcoin Vibes!*

💰 *BTC*: $${priceFormatted} ${changeIcon} ${changeText}%

${diamonds} *Your Money Never Sleeps!*
BitVault Pro works weekends, holidays, 24/7!

🔄 Non-stop profits
⚡ Always trading
💎 Growing your wealth

*Relax and let BitVault Pro do the heavy lifting!*
*Passive income is the BEST income!* 🏖️`,

            // Wealth Building
            `💎 *BUILD REAL WEALTH!*

🪙 *Bitcoin*: $${priceFormatted} ${changeIcon} ${changeText}%

${rockets} *Stop Being Broke - Start Being RICH!*

✅ Daily profits compound = WEALTH
💰 Smart reinvestment = GROWTH  
🔥 Professional trading = RESULTS
⚡ BitVault Pro = YOUR SUCCESS

*Rich people make their money work!*
*Poor people just hold and hope!* 
*Which one are YOU?* 🤑`,

            // Simple Success
            `✨ *Simple Success Formula*

💰 *Bitcoin*: $${priceFormatted} ${changeIcon} ${changeText}%

Your Bitcoin + BitVault Pro = DAILY PROFITS! 

🎯 It's that simple!
🚀 It's that powerful!
💎 It's that PROFITABLE!

*Stop complicating success!*
*Join BitVault Pro and start WINNING!* 🏆`,

            // Dream Achiever
            `🌟 *Turn Dreams into REALITY!*

🪙 *BTC*: $${priceFormatted} ${changeIcon} ${changeText}%

${sparkles} *Financial Freedom is POSSIBLE!*

💰 Daily Bitcoin profits = FREEDOM
🔄 Automated systems = PEACE OF MIND
🚀 Compound growth = WEALTH
✨ BitVault Pro = YOUR TICKET OUT

*Stop dreaming, start EARNING!*
*Your future self will THANK you!* 🙌`,

            // Final Push
            `🔥 *LAST CHANCE ENERGY!*

💰 *Bitcoin*: $${priceFormatted} ${changeIcon} ${changeText}%

${diamonds} *The Train is LEAVING!*
${parseFloat(change24h) >= 0 ? 'Bitcoin is moving UP!' : 'Perfect entry opportunity!'}

✅ Smart investors = READY
💸 Daily profits = WAITING
🚀 Success = ONE CLICK AWAY

*Don't be the person who says*
*"I SHOULD HAVE" - BE THE ONE WHO DID!* 

*BitVault Pro: Where Bitcoin becomes INCOME!* ⚡`,

            // Weekend Motivation
            `💎 *Weekend Wealth Check!*

🪙 *BTC*: $${priceFormatted} ${changeIcon} ${changeText}%

*Your Bitcoin earned MORE this week with BitVault Pro!* 

📈 Profits: GROWING
💰 Returns: COMPOUNDING  
🔥 Success: INEVITABLE
✨ You: WINNING

*Make every week a PROFIT week!* 🏆`
        ];
        
        return messages[messageType];
    }

    /**
     * Get real-time Bitcoin price and market data
     */
    async getBitcoinPrice() {
        try {
            // Use CoinGecko's free API for real-time Bitcoin data
            const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true&include_market_cap=true');
            const data = await response.json();
            
            if (data.bitcoin) {
                return {
                    price: Math.round(data.bitcoin.usd),
                    change24h: data.bitcoin.usd_24h_change ? data.bitcoin.usd_24h_change.toFixed(2) : '0.00',
                    marketCap: data.bitcoin.usd_market_cap ? Math.round(data.bitcoin.usd_market_cap / 1e9) : 950
                };
            }
            
            throw new Error('Invalid API response');
        } catch (error) {
            logger.warn('Failed to fetch Bitcoin price from API, using fallback:', error.message);
            
            // Fallback to realistic mock data
            const basePrice = 45000 + (Math.random() - 0.5) * 10000;
            return {
                price: Math.round(basePrice),
                change24h: ((Math.random() - 0.5) * 10).toFixed(2),
                marketCap: Math.round(basePrice * 19.5 / 1e9)
            };
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
