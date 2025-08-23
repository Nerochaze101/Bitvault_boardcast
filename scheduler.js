const cron = require('node-cron');
const { sendDailyMarketSummary } = require('./bot');
const config = require('./config');
const logger = require('./logger');

class TelegramScheduler {
    constructor() {
        this.jobs = new Map();
        this.isRunning = false;
    }

    /**
     * Start the scheduler
     */
    start() {
        if (!config.enableScheduler) {
            logger.info('Scheduler is disabled');
            return;
        }

        try {
            // Schedule daily market summary
            this.scheduleDailyUpdate();
            
            this.isRunning = true;
            logger.info('Scheduler started successfully');
        } catch (error) {
            logger.error('Failed to start scheduler:', error.message);
            throw error;
        }
    }

    /**
     * Schedule daily market summary
     */
    scheduleDailyUpdate() {
        const cronExpression = config.dailyUpdateTime;
        
        // Validate cron expression
        if (!cron.validate(cronExpression)) {
            throw new Error(`Invalid cron expression: ${cronExpression}`);
        }

        const job = cron.schedule(cronExpression, async () => {
            logger.info('Executing scheduled daily market summary...');
            
            try {
                await sendDailyMarketSummary();
                logger.info('Daily market summary sent successfully');
            } catch (error) {
                logger.error('Failed to send daily market summary:', error.message);
                
                // Optional: Send error notification to admin channel
                this.handleScheduledTaskError(error);
            }
        }, {
            scheduled: false,
            timezone: config.timezone
        });

        this.jobs.set('dailyUpdate', job);
        job.start();
        
        logger.info(`Daily update scheduled: ${cronExpression} (${config.timezone})`);
    }

    /**
     * Schedule custom message
     */
    scheduleCustomMessage(name, cronExpression, message, options = {}) {
        try {
            if (!cron.validate(cronExpression)) {
                throw new Error(`Invalid cron expression: ${cronExpression}`);
            }

            // Stop existing job with same name
            if (this.jobs.has(name)) {
                this.jobs.get(name).stop();
                this.jobs.delete(name);
            }

            const { broadcastUpdate } = require('./bot');
            
            const job = cron.schedule(cronExpression, async () => {
                logger.info(`Executing scheduled message: ${name}`);
                
                try {
                    await broadcastUpdate(message);
                    logger.info(`Scheduled message '${name}' sent successfully`);
                } catch (error) {
                    logger.error(`Failed to send scheduled message '${name}':`, error.message);
                    this.handleScheduledTaskError(error);
                }
            }, {
                scheduled: false,
                timezone: options.timezone || config.timezone
            });

            this.jobs.set(name, job);
            job.start();
            
            logger.info(`Custom message '${name}' scheduled: ${cronExpression}`);
            return true;
        } catch (error) {
            logger.error(`Failed to schedule custom message '${name}':`, error.message);
            throw error;
        }
    }

    /**
     * Stop a scheduled job
     */
    stopJob(name) {
        if (this.jobs.has(name)) {
            this.jobs.get(name).stop();
            this.jobs.delete(name);
            logger.info(`Stopped scheduled job: ${name}`);
            return true;
        }
        return false;
    }

    /**
     * Stop all scheduled jobs
     */
    stop() {
        this.jobs.forEach((job, name) => {
            job.stop();
            logger.info(`Stopped job: ${name}`);
        });
        
        this.jobs.clear();
        this.isRunning = false;
        logger.info('All scheduled jobs stopped');
    }

    /**
     * Get scheduler status
     */
    getStatus() {
        const jobStatuses = {};
        this.jobs.forEach((job, name) => {
            jobStatuses[name] = {
                running: job.running || false,
                lastDate: job.lastDate || null,
                nextDate: job.nextDate || null
            };
        });

        return {
            isRunning: this.isRunning,
            jobCount: this.jobs.size,
            jobs: jobStatuses,
            timezone: config.timezone
        };
    }

    /**
     * Handle errors in scheduled tasks
     */
    async handleScheduledTaskError(error) {
        try {
            // Log the error
            logger.error('Scheduled task failed:', {
                error: error.message,
                timestamp: new Date().toISOString()
            });

            // Optional: Send error notification to admin (implement if needed)
            // await this.notifyAdmin(`🚨 Scheduled task failed: ${error.message}`);
            
        } catch (notificationError) {
            logger.error('Failed to handle scheduled task error:', notificationError.message);
        }
    }

    /**
     * Add sample scheduled messages for BitVault Pro
     */
    setupBitVaultSchedules() {
        // Weekly portfolio summary (Mondays at 10 AM)
        this.scheduleCustomMessage(
            'weeklyPortfolio',
            '0 10 * * 1',
            `📊 *Weekly BitVault Pro Portfolio Summary*

💰 *Total Assets Under Management*: Growing Strong
📈 *Weekly Performance*: Exceeding Expectations
🔒 *Security Status*: All Systems Green

🚀 *This Week's Highlights*:
✅ Automated profit distributions completed
✅ New investment opportunities identified
✅ Portfolio rebalancing optimized

*Ready to grow your Bitcoin portfolio?*
Join BitVault Pro today! 💎`
        );

        // Profit distribution notification (Every 6 hours)
        this.scheduleCustomMessage(
            'profitDistribution',
            '0 */6 * * *',
            `💰 *Automated Profit Distribution Complete!*

🎯 *BitVault Pro Update*:
✅ Latest profits distributed to all active investments
📊 Returns calculated and credited to your account
🔄 Compound interest automatically applied

*Your Bitcoin is working for you 24/7!* 🚀

Check your dashboard for updated balances 📈`
        );

        logger.info('BitVault Pro scheduled messages configured');
    }
}

// Create and export singleton instance
const scheduler = new TelegramScheduler();

module.exports = {
    scheduler,
    start: () => scheduler.start(),
    stop: () => scheduler.stop(),
    getStatus: () => scheduler.getStatus(),
    scheduleCustomMessage: (name, cronExpression, message, options) => 
        scheduler.scheduleCustomMessage(name, cronExpression, message, options),
    stopJob: (name) => scheduler.stopJob(name),
    setupBitVaultSchedules: () => scheduler.setupBitVaultSchedules()
};
