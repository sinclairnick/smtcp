/**
 * HTTP webhook server for receiving emails via REST API
 */

import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { ParsedEmail, Attachment, Logger } from '../types/index.js';

export interface WebhookServerOptions {
	/** Port to listen on */
	port: number;
	/** Host to bind to */
	host?: string;
	/** Path for the webhook endpoint */
	path?: string;
	/** Optional secret for webhook authentication */
	secret?: string;
}

export interface WebhookServerCallbacks {
	/** Called when an email is received */
	onEmail: (email: ParsedEmail) => Promise<void>;
	/** Called on errors */
	onError?: (error: Error) => void;
}

export interface WebhookServerInstance {
	/** Start listening */
	start: () => Promise<void>;
	/** Stop the server */
	stop: () => Promise<void>;
	/** Get server address info */
	address: () => { port: number; host: string } | null;
}

/**
 * Webhook payload format for incoming emails
 */
export interface WebhookEmailPayload {
	/** Message ID */
	messageId?: string;
	/** Sender */
	from: { address: string; name?: string };
	/** Recipients */
	to: Array<{ address: string; name?: string }>;
	/** CC recipients */
	cc?: Array<{ address: string; name?: string }>;
	/** Subject */
	subject: string;
	/** Plain text body */
	text?: string;
	/** HTML body */
	html?: string;
	/** Attachments (base64 encoded content) */
	attachments?: Array<{
		filename: string;
		contentType: string;
		content: string; // base64 encoded
	}>;
	/** Headers */
	headers?: Record<string, string>;
	/** Send date (ISO string) */
	date?: string;
}

/**
 * Create an HTTP webhook server for receiving emails
 */
export function createWebhookServer(
	options: WebhookServerOptions,
	callbacks: WebhookServerCallbacks,
	logger: Logger
): WebhookServerInstance {
	const path = options.path ?? '/webhook';

	const server = createHttpServer((req, res) => {
		handleRequest(req, res, options, callbacks, logger, path);
	});

	return {
		start: () => {
			return new Promise((resolve, reject) => {
				server.listen(options.port, options.host ?? '0.0.0.0', () => {
					logger.info('Webhook server started', {
						port: options.port,
						host: options.host ?? '0.0.0.0',
						path,
					});
					resolve();
				});
				server.on('error', reject);
			});
		},

		stop: () => {
			return new Promise((resolve) => {
				server.close(() => {
					logger.info('Webhook server stopped');
					resolve();
				});
			});
		},

		address: () => {
			const addr = server.address();
			if (!addr || typeof addr === 'string') return null;
			return { port: addr.port, host: addr.address };
		},
	};
}

/**
 * Handle incoming HTTP request
 */
function handleRequest(
	req: IncomingMessage,
	res: ServerResponse,
	options: WebhookServerOptions,
	callbacks: WebhookServerCallbacks,
	logger: Logger,
	path: string
): void {
	// Only accept POST to the webhook path
	if (req.method !== 'POST' || req.url !== path) {
		res.writeHead(404, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: 'Not found' }));
		return;
	}

	// Check secret if configured
	if (options.secret) {
		const authHeader = req.headers['authorization'];
		const expectedAuth = `Bearer ${options.secret}`;
		if (authHeader !== expectedAuth) {
			logger.warn('Webhook authentication failed');
			res.writeHead(401, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: 'Unauthorized' }));
			return;
		}
	}

	// Read body
	const chunks: Buffer[] = [];
	req.on('data', (chunk: Buffer) => chunks.push(chunk));
	req.on('end', () => {
		const body = Buffer.concat(chunks).toString('utf-8');

		try {
			const payload = JSON.parse(body) as WebhookEmailPayload;
			const email = convertWebhookPayload(payload);

			logger.info('Email received via webhook', {
				messageId: email.messageId,
				from: email.from.address,
				to: email.to.map((t) => t.address),
				subject: email.subject,
			});

			callbacks.onEmail(email)
				.then(() => {
					res.writeHead(200, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({ success: true, messageId: email.messageId }));
				})
				.catch((err: unknown) => {
					const error = err instanceof Error ? err : new Error(String(err));
					logger.error('Failed to process webhook email', { error: error.message });
					callbacks.onError?.(error);
					res.writeHead(500, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({ error: 'Processing failed' }));
				});
		} catch (err) {
			logger.error('Invalid webhook payload', { error: String(err) });
			res.writeHead(400, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: 'Invalid payload' }));
		}
	});
}

/**
 * Convert webhook payload to ParsedEmail
 */
function convertWebhookPayload(payload: WebhookEmailPayload): ParsedEmail {
	const attachments: Attachment[] = (payload.attachments ?? []).map((att) => ({
		filename: att.filename,
		contentType: att.contentType,
		content: Buffer.from(att.content, 'base64'),
		size: Buffer.from(att.content, 'base64').length,
	}));

	const headers = new Map<string, string>();
	if (payload.headers) {
		for (const [key, value] of Object.entries(payload.headers)) {
			headers.set(key, value);
		}
	}

	return {
		messageId: payload.messageId ?? generateMessageId(),
		from: payload.from,
		to: payload.to,
		cc: payload.cc,
		subject: payload.subject,
		text: payload.text,
		html: payload.html,
		attachments,
		headers,
		date: payload.date ? new Date(payload.date) : undefined,
	};
}

/**
 * Generate a random message ID
 */
function generateMessageId(): string {
	const random = Math.random().toString(36).substring(2, 15);
	const timestamp = Date.now().toString(36);
	return `<${timestamp}.${random}@smtcp.webhook>`;
}
