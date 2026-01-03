/**
 * Simple logger implementation
 */

import type { Logger } from '../types/index.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
};

/**
 * Create a simple console logger
 */
export function createLogger(options?: { level?: LogLevel; prefix?: string }): Logger {
	const minLevel = LOG_LEVELS[options?.level ?? 'info'];
	const prefix = options?.prefix ?? 'smtcp';

	const formatMessage = (level: LogLevel, message: string, meta?: Record<string, unknown>) => {
		const timestamp = new Date().toISOString();
		const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
		return `[${timestamp}] [${prefix}] [${level.toUpperCase()}] ${message}${metaStr}`;
	};

	return {
		debug: (message, meta) => {
			if (LOG_LEVELS['debug'] >= minLevel) {
				console.debug(formatMessage('debug', message, meta));
			}
		},
		info: (message, meta) => {
			if (LOG_LEVELS['info'] >= minLevel) {
				console.info(formatMessage('info', message, meta));
			}
		},
		warn: (message, meta) => {
			if (LOG_LEVELS['warn'] >= minLevel) {
				console.warn(formatMessage('warn', message, meta));
			}
		},
		error: (message, meta) => {
			if (LOG_LEVELS['error'] >= minLevel) {
				console.error(formatMessage('error', message, meta));
			}
		},
	};
}

/**
 * Create a silent logger (for testing)
 */
export function createSilentLogger(): Logger {
	const noop = () => { };
	return { debug: noop, info: noop, warn: noop, error: noop };
}
