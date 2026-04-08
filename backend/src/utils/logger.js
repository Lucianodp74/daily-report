// ================================================================
// utils/logger.js — Logger strutturato con pino
// npm install pino pino-pretty pino-http
// ================================================================
const pino = require('pino')

const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  ...(process.env.NODE_ENV !== 'production' && {
    transport: {
      target:  'pino-pretty',
      options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' }
    }
  }),
  // In produzione: output JSON strutturato (compatibile con Datadog/CloudWatch)
  base: {
    app:     'daily-report',
    version: process.env.npm_package_version || '2.0.0',
    env:     process.env.NODE_ENV || 'development',
  },
})

module.exports = logger
