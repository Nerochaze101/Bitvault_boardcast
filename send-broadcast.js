
const { sendDailyMarketSummary, initialize } = require('./bot');
const logger = require('./logger');

async function sendTodaysBroadcast() {
    try {
        await initialize();
        const result = await sendDailyMarketSummary();
        logger.info('Today\'s broadcast sent successfully!', result);
        process.exit(0);
    } catch (error) {
        logger.error('Failed to send broadcast:', error.message);
        process.exit(1);
    }
}

sendTodaysBroadcast();
