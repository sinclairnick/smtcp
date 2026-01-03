/**
 * SMTCP - AI-Powered Email Processing Framework
 *
 * @packageDocumentation
 */

// Main exports
export {
	createServer,
	ServerBuilder,
	type ServerBuilderOptions,
	type SmtpTransportOptions,
	type HttpTransportOptions,
	type RouteOptions,
	type PlainRouteOptions,
} from './builder.js';

// Type exports
export type {
	// Email types
	ParsedEmail,
	EmailAddress,
	Attachment,
	// Handler types
	EmailHandler,
	PlainHandler,
	EmailContext,
	ToolContext,
	HandlerResult,
	ReplyOptions,
	// Route types
	Route,
	// AI types
	AIProcessor,
	ProcessOptions,
	ProcessResult,
	GenerateObjectOptions,
	ToolCallResult,
	TokenUsage,
	// MCP types
	MCPServerConfig,
	InlineMCPServerConfig,
	// Config types
	SmtcpConfig,
	SMTPServerConfig,
	SMTPSenderConfig,
	SMTPAuthConfig,
	RouteConfig,
	// Utility types
	Logger,
	SmtcpServer,
} from './types/index.js';

// Server module exports
export { createSmtpServer, parseEmail, createEmailSender, createWebhookServer } from './server/index.js';
export type {
	SmtpServerInstance,
	SmtpServerCallbacks,
	EmailSender,
	SendOptions,
	WebhookServerInstance,
	WebhookServerOptions,
	WebhookServerCallbacks,
	WebhookEmailPayload,
} from './server/index.js';

// Routing exports
export { createRouter } from './routing/index.js';
export type { Router } from './routing/index.js';

// AI exports
export { createProcessor, defineTool, createTool, bindToolsToContext } from './ai/index.js';
export { createMCPClients, aggregateMCPTools, closeMCPClients } from './ai/index.js';
export type { ProcessorConfig, MCPClient, Tool } from './ai/index.js';

// Config exports
export { loadConfig, loadConfigFromEnv, mergeConfigs } from './config/index.js';

// Utility exports
export { createLogger, createSilentLogger } from './utils/index.js';
export type { LogLevel } from './utils/index.js';
