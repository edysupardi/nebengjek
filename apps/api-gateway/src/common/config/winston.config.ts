// apps/api-gateway/src/common/config/winston.config.ts
import { LoggerOptions, format, transports } from 'winston';
import * as winston from 'winston';
import { ConfigService } from '@nestjs/config';
import 'winston-daily-rotate-file';

export const createWinstonLoggerOptions = (configService: ConfigService): LoggerOptions => {
  const environment = configService.get('NODE_ENV', 'development');
  const logLevel = configService.get('LOG_LEVEL', 'info');
  const isProduction = environment === 'production';

  // Format untuk log console
  const consoleFormat = format.combine(
    format.timestamp(),
    format.colorize(),
    format.printf(({ timestamp, level, message, context, trace, ...meta }) => {
      return `${timestamp} [${level}] [${context || 'Application'}]: ${message} ${
        Object.keys(meta).length ? JSON.stringify(meta) : ''
      } ${trace || ''}`;
    }),
  );

  // Format untuk log file (tanpa warna)
  const fileFormat = format.combine(
    format.timestamp(),
    format.printf(({ timestamp, level, message, context, trace, ...meta }) => {
      return `${timestamp} [${level}] [${context || 'Application'}]: ${message} ${
        Object.keys(meta).length ? JSON.stringify(meta) : ''
      } ${trace || ''}`;
    }),
  );

  // Konfigurasi transports
  const logTransports: winston.transport[] = [
    new transports.Console({
      level: logLevel,
      format: consoleFormat,
    }),
  ];

  // Tambahkan file transport di production
  if (isProduction) {
    // File transport untuk semua log
    logTransports.push(
      new winston.transports.DailyRotateFile({
        filename: 'logs/api-gateway-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        maxSize: '20m',
        maxFiles: '14d',
        format: fileFormat,
        level: logLevel,
      }),
    );

    // File transport khusus untuk error
    logTransports.push(
      new winston.transports.DailyRotateFile({
        filename: 'logs/api-gateway-error-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        maxSize: '20m',
        maxFiles: '14d',
        format: fileFormat,
        level: 'error',
      }),
    );
  }

  return {
    transports: logTransports,
    // Tambahan format untuk semua transports
    format: format.combine(
      format.timestamp(),
      format.errors({ stack: true }),
      format.metadata({ fillExcept: ['timestamp', 'level', 'message', 'context'] }),
    ),
  };
};
