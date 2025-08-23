# BitVault Pro Telegram Bot

## Overview

BitVault Pro Telegram Bot is a professional Node.js service designed for automated broadcasting and scheduled messaging to Telegram channels. The system specializes in sending daily market summaries and custom updates for a Bitcoin investment platform called BitVault Pro. The bot features a REST API for programmatic integration, robust error handling with retry mechanisms, comprehensive logging, and configurable scheduling capabilities.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Core Components

**Bot Engine (bot.js)**
- Implements a class-based Telegram bot wrapper using `node-telegram-bot-api`
- Provides initialization, channel verification, and message broadcasting capabilities
- Features retry mechanisms with configurable attempts and delays
- Handles error recovery and connection validation

**Configuration Management (config.js)**
- Centralized configuration using environment variables via `dotenv`
- Validates required settings on startup (bot token, channel ID)
- Supports feature flags for enabling/disabling scheduler and API components
- Includes timezone and cron expression configuration for scheduling

**Logging System (logger.js)**
- Custom JSON-structured logging with multiple severity levels (error, warn, info, debug)
- File-based logging with automatic directory creation
- Console output with timestamp formatting
- Request/response logging for API endpoints

**Scheduler Service (scheduler.js)**
- Cron-based job scheduling using `node-cron`
- Daily market summary automation with configurable timing
- Support for custom message scheduling
- Job management with start/stop capabilities

**HTTP API Server (server.js)**
- Express.js REST API for external integrations
- CORS-enabled endpoints for cross-origin requests
- Request logging and error handling middleware
- JSON body parsing with size limits

### Architectural Patterns

**Event-Driven Design**
- Scheduler triggers automated messaging events
- API endpoints invoke bot broadcasting functions
- Error events are captured and logged systematically

**Configuration-First Approach**
- All behavior controlled through environment variables
- Feature flags enable/disable major components
- Validation ensures required settings are present

**Layered Error Handling**
- Bot-level retry mechanisms for Telegram API failures
- Express middleware for HTTP request errors
- Comprehensive logging at all error boundaries

**Modular Service Architecture**
- Separate concerns into distinct modules (bot, scheduler, server, logger)
- Each module can be initialized and tested independently
- Clear interfaces between components

## External Dependencies

**Core Runtime**
- Node.js runtime environment
- npm package management

**Telegram Integration**
- `node-telegram-bot-api` - Official Telegram Bot API wrapper
- Telegram Bot API for message broadcasting and channel management

**Scheduling & Timing**
- `node-cron` - Cron-based job scheduling
- System timezone configuration support

**Web Server & API**
- `express` - HTTP server framework for REST API endpoints
- Built-in CORS and JSON parsing capabilities

**Configuration & Environment**
- `dotenv` - Environment variable loading from .env files
- Process environment variable access

**File System**
- Native Node.js `fs` module for log file management
- Directory creation and file writing operations

**Networking**
- HTTP/HTTPS protocols for Telegram API communication
- Express server for incoming API requests