#!/usr/bin/env node

import dotenv from 'dotenv';
import { WhyServer } from './web/server.js';

// Load environment variables
dotenv.config();

/**
 * Web-based "Why does this exist?" system entry point
 */
async function startWebServer() {
  console.log('🌐 Starting Why Engine Web Server...');
  
  const server = new WhyServer({
    port: process.env.PORT || 3000,
    dbPath: process.env.DB_PATH || './storage/events.db'
  });

  try {
    await server.start();
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down web server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down web server...');
  process.exit(0);
});

startWebServer();