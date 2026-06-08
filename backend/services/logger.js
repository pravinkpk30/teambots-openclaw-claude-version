const winston = require('winston');
const path = require('path');
const fs = require('fs');

const logDir = process.env.TEAMBOTS_LOG_DIR || path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

const fmt = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
    return `${timestamp} [${level.toUpperCase()}] ${message}${metaStr}`;
  })
);

function makeLogger(name) {
  return winston.createLogger({
    level: 'info',
    format: fmt,
    transports: [
      new winston.transports.Console(),
      new winston.transports.File({ filename: path.join(logDir, `${name}.log`) }),
    ],
  });
}

module.exports = {
  kasm:    makeLogger('kasm'),
  chat:    makeLogger('chat'),
  webhook: makeLogger('webhook'),
  api:     makeLogger('api'),
  hire:    makeLogger('hire'),
};
