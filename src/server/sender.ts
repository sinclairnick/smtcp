/**
 * Email sender module - sends reply emails via SMTP
 */

import nodemailer, { type Transporter } from 'nodemailer';
import type { SMTPSenderConfig, ParsedEmail, ReplyOptions, Logger } from '../types/index.js';

export interface EmailSender {
	/** Send a reply to an email */
	sendReply: (original: ParsedEmail, options: ReplyOptions) => Promise<void>;
	/** Send a new email */
	send: (options: SendOptions) => Promise<void>;
	/** Close the connection */
	close: () => Promise<void>;
}

export interface SendOptions {
	to: string | string[];
	subject: string;
	text?: string;
	html?: string;
	cc?: string[];
	bcc?: string[];
	attachments?: Array<{
		filename: string;
		content: Buffer | string;
		contentType?: string;
	}>;
	replyTo?: string;
	inReplyTo?: string;
	references?: string[];
}

/**
 * Create an email sender
 */
export function createEmailSender(
	config: SMTPSenderConfig,
	logger: Logger
): EmailSender {
	const transporter: Transporter = nodemailer.createTransport({
		host: config.host,
		port: config.port,
		secure: config.secure ?? config.port === 465,
		auth: config.auth,
	});

	const defaultFrom = config.from ?? `smtcp@${config.host}`;

	return {
		sendReply: async (original: ParsedEmail, options: ReplyOptions) => {
			const subject = options.subject ?? `Re: ${original.subject}`;
			const to = original.from.address;
			const inReplyTo = original.messageId;
			const references = original.references
				? [...original.references, original.messageId]
				: [original.messageId];

			await transporter.sendMail({
				from: defaultFrom,
				to,
				cc: options.cc,
				subject,
				text: options.text,
				html: options.html,
				inReplyTo,
				references: references.join(' '),
				attachments: options.attachments?.map((att) => ({
					filename: att.filename,
					content: att.content,
					contentType: att.contentType,
				})),
			});

			logger.info('Reply sent', {
				to,
				subject,
				inReplyTo,
			});
		},

		send: async (options: SendOptions) => {
			await transporter.sendMail({
				from: defaultFrom,
				to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
				cc: options.cc?.join(', '),
				bcc: options.bcc?.join(', '),
				subject: options.subject,
				text: options.text,
				html: options.html,
				replyTo: options.replyTo,
				inReplyTo: options.inReplyTo,
				references: options.references?.join(' '),
				attachments: options.attachments?.map((att) => ({
					filename: att.filename,
					content: att.content,
					contentType: att.contentType,
				})),
			});

			logger.info('Email sent', {
				to: options.to,
				subject: options.subject,
			});
		},

		close: async () => {
			transporter.close();
		},
	};
}
