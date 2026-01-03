/**
 * SMTP server module - receives incoming emails
 */

import { SMTPServer, type SMTPServerOptions, type SMTPServerSession } from 'smtp-server';
import type { ParsedEmail, SMTPServerConfig, SMTPAuthConfig, Logger } from '../types/index.js';
import { parseEmail } from './parser.js';

export interface SmtpServerCallbacks {
	/** Called when an email is received */
	onEmail: (email: ParsedEmail, session: SMTPServerSession) => Promise<void>;
	/** Called on errors */
	onError?: (error: Error) => void;
}

export interface SmtpServerInstance {
	/** Start listening for connections */
	start: () => Promise<void>;
	/** Stop the server */
	stop: () => Promise<void>;
	/** Get server address info */
	address: () => { port: number; host: string } | null;
}

/**
 * Create an SMTP server that receives emails
 */
export function createSmtpServer(
	config: SMTPServerConfig,
	callbacks: SmtpServerCallbacks,
	logger: Logger
): SmtpServerInstance {
	const serverOptions: SMTPServerOptions = {
		// Disable authentication by default
		authOptional: true,
		disabledCommands: config.auth ? [] : ['AUTH'],

		// Size limit
		size: config.maxMessageSize ?? 25 * 1024 * 1024, // 25MB default

		// TLS configuration
		secure: config.secure ?? false,

		// Handle authentication if configured
		onAuth: config.auth
			? (auth, _session, callback) => {
				handleAuth(auth, config.auth!, callback);
			}
			: undefined,

		// Handle incoming mail
		onData: (stream, session, callback) => {
			handleMailData(stream, session, callbacks, logger, callback);
		},

		// Log connection events
		onConnect: (session, callback) => {
			logger.debug('SMTP connection established', {
				remoteAddress: session.remoteAddress,
				clientHostname: session.clientHostname,
			});
			callback();
		},

		onClose: (session) => {
			logger.debug('SMTP connection closed', {
				remoteAddress: session.remoteAddress,
			});
		},
	};

	const server = new SMTPServer(serverOptions);

	// Handle server errors
	server.on('error', (err) => {
		logger.error('SMTP server error', { error: err.message });
		callbacks.onError?.(err);
	});

	return {
		start: () => {
			return new Promise((resolve, reject) => {
				server.listen(config.port, config.host ?? '0.0.0.0', () => {
					logger.info('SMTP server started', {
						port: config.port,
						host: config.host ?? '0.0.0.0',
					});
					resolve();
				});
				server.on('error', reject);
			});
		},

		stop: () => {
			return new Promise((resolve) => {
				server.close(() => {
					logger.info('SMTP server stopped');
					resolve();
				});
			});
		},

		address: () => {
			const addr = server.server.address();
			if (!addr || typeof addr === 'string') return null;
			return { port: addr.port, host: addr.address };
		},
	};
}

/**
 * Handle SMTP authentication
 */
function handleAuth(
	auth: { username?: string; password?: string; method: string },
	config: SMTPAuthConfig,
	callback: (err: Error | null, response?: { user: string }) => void
): void {
	if (auth.username === config.user && auth.password === config.pass) {
		callback(null, { user: auth.username });
	} else {
		callback(new Error('Invalid credentials'));
	}
}

/**
 * Handle incoming mail data
 */
function handleMailData(
	stream: NodeJS.ReadableStream,
	session: SMTPServerSession,
	callbacks: SmtpServerCallbacks,
	logger: Logger,
	callback: (err?: Error | null) => void
): void {
	const chunks: Buffer[] = [];

	stream.on('data', (chunk: Buffer) => {
		chunks.push(chunk);
	});

	stream.on('end', () => {
		const buffer = Buffer.concat(chunks);

		parseEmail(buffer)
			.then((email) => {
				logger.info('Email received', {
					messageId: email.messageId,
					from: email.from.address,
					to: email.to.map((t) => t.address),
					subject: email.subject,
					attachments: email.attachments.length,
				});

				return callbacks.onEmail(email, session);
			})
			.then(() => {
				callback();
			})
			.catch((err: unknown) => {
				const error = err instanceof Error ? err : new Error(String(err));
				logger.error('Failed to process email', { error: error.message });
				callback(error);
			});
	});

	stream.on('error', (err) => {
		logger.error('Stream error while receiving email', { error: err.message });
		callback(err);
	});
}
