const fs = require('fs');
const path = require('path');

class Logger {
    constructor() {
        this.levels = {
            error: 0,
            warn: 1,
            info: 2,
            debug: 3
        };
        
        this.currentLevel = this.levels[process.env.LOG_LEVEL] || this.levels.info;
        this.logDir = process.env.LOG_DIR || './logs';
        
        // Create logs directory if it doesn't exist
        this.ensureLogDirectory();
    }

    /**
     * Ensure log directory exists
     */
    ensureLogDirectory() {
        if (!fs.existsSync(this.logDir)) {
            try {
                fs.mkdirSync(this.logDir, { recursive: true });
            } catch (error) {
                console.error('Failed to create log directory:', error.message);
            }
        }
    }

    /**
     * Format log message
     */
    formatMessage(level, message, meta = {}) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level: level.toUpperCase(),
            message: typeof message === 'string' ? message : JSON.stringify(message),
            ...meta
        };

        return JSON.stringify(logEntry);
    }

    /**
     * Write log to file
     */
    writeToFile(level, formattedMessage) {
        try {
            const logFile = path.join(this.logDir, `bitvault-bot-${new Date().toISOString().split('T')[0]}.log`);
            const logLine = formattedMessage + '\n';
            
            fs.appendFileSync(logFile, logLine, 'utf8');
        } catch (error) {
            console.error('Failed to write to log file:', error.message);
        }
    }

    /**
     * Log message with specific level
     */
    log(level, message, meta = {}) {
        if (this.levels[level] <= this.currentLevel) {
            const formattedMessage = this.formatMessage(level, message, meta);
            
            // Console output with color coding
            const colors = {
                error: '\x1b[31m', // Red
                warn: '\x1b[33m',  // Yellow
                info: '\x1b[36m',  // Cyan
                debug: '\x1b[37m'  // White
            };
            
            const resetColor = '\x1b[0m';
            const colorCode = colors[level] || colors.info;
            
            console.log(`${colorCode}[${level.toUpperCase()}]${resetColor} ${message}`, 
                       Object.keys(meta).length > 0 ? meta : '');
            
            // Write to file
            this.writeToFile(level, formattedMessage);
        }
    }

    /**
     * Error level logging
     */
    error(message, meta = {}) {
        this.log('error', message, meta);
    }

    /**
     * Warning level logging
     */
    warn(message, meta = {}) {
        this.log('warn', message, meta);
    }

    /**
     * Info level logging
     */
    info(message, meta = {}) {
        this.log('info', message, meta);
    }

    /**
     * Debug level logging
     */
    debug(message, meta = {}) {
        this.log('debug', message, meta);
    }

    /**
     * Log HTTP requests
     */
    logRequest(req, res, responseTime) {
        const logData = {
            method: req.method,
            url: req.url,
            statusCode: res.statusCode,
            responseTime: `${responseTime}ms`,
            userAgent: req.get('User-Agent'),
            ip: req.ip
        };

        this.info('HTTP Request', logData);
    }

    /**
     * Log Telegram API calls
     */
    logTelegramCall(method, params, success, error = null) {
        const logData = {
            telegramMethod: method,
            params: JSON.stringify(params),
            success,
            error: error ? error.message : null,
            timestamp: new Date().toISOString()
        };

        if (success) {
            this.info('Telegram API Call', logData);
        } else {
            this.error('Telegram API Call Failed', logData);
        }
    }

    /**
     * Get log file paths for the current day
     */
    getCurrentLogFile() {
        const today = new Date().toISOString().split('T')[0];
        return path.join(this.logDir, `bitvault-bot-${today}.log`);
    }

    /**
     * Read recent logs
     */
    getRecentLogs(lines = 100) {
        try {
            const logFile = this.getCurrentLogFile();
            
            if (!fs.existsSync(logFile)) {
                return [];
            }

            const content = fs.readFileSync(logFile, 'utf8');
            const logLines = content.trim().split('\n');
            
            return logLines.slice(-lines).map(line => {
                try {
                    return JSON.parse(line);
                } catch (error) {
                    return { raw: line };
                }
            });
        } catch (error) {
            this.error('Failed to read logs:', error.message);
            return [];
        }
    }
}

// Create and export singleton instance
const logger = new Logger();

module.exports = logger;
