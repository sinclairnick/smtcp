/**
 * Server module exports
 */

export { createSmtpServer, type SmtpServerInstance, type SmtpServerCallbacks } from './smtp.js';
export { parseEmail } from './parser.js';
export { createEmailSender, type EmailSender, type SendOptions } from './sender.js';
export {
	createWebhookServer,
	type WebhookServerInstance,
	type WebhookServerOptions,
	type WebhookServerCallbacks,
	type WebhookEmailPayload,
} from './webhook.js';
