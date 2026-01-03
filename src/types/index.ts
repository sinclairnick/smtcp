/**
 * Core types for the SMTCP framework
 */

import type { LanguageModel, Tool, CoreMessage } from 'ai';

// ============================================================================
// Email Types
// ============================================================================

/**
 * Represents a parsed email address
 */
export interface EmailAddress {
	address: string;
	name?: string;
}

/**
 * Represents an email attachment
 */
export interface Attachment {
	/** Original filename */
	filename: string;
	/** MIME content type */
	contentType: string;
	/** Size in bytes */
	size: number;
	/** Attachment content as Buffer */
	content: Buffer;
	/** Content-ID for inline attachments */
	cid?: string;
	/** Whether this is an inline attachment */
	inline?: boolean;
}

/**
 * Represents a parsed incoming email
 */
export interface ParsedEmail {
	/** Unique message ID */
	messageId: string;
	/** Sender address */
	from: EmailAddress;
	/** Primary recipients */
	to: EmailAddress[];
	/** CC recipients */
	cc?: EmailAddress[];
	/** BCC recipients (if available) */
	bcc?: EmailAddress[];
	/** Email subject */
	subject: string;
	/** Plain text body */
	text?: string;
	/** HTML body */
	html?: string;
	/** File attachments */
	attachments: Attachment[];
	/** Email headers */
	headers: Map<string, string>;
	/** Send date */
	date?: Date;
	/** In-Reply-To header */
	inReplyTo?: string;
	/** References header */
	references?: string[];
	/** Raw email source (optional, for debugging) */
	raw?: string;
}

// ============================================================================
// MCP Types
// ============================================================================

/**
 * Configuration for an external MCP server
 */
export interface MCPServerConfig {
	/** Human-readable name for this MCP server */
	name: string;
	/** Transport type */
	type: 'http' | 'sse' | 'stdio';
	/** URL for HTTP/SSE transport */
	url?: string;
	/** Command to spawn for stdio transport */
	command?: string;
	/** Arguments for stdio command */
	args?: string[];
	/** Environment variables for stdio command */
	env?: Record<string, string>;
}

/**
 * Definition for an inline MCP server
 */
export interface InlineMCPServerConfig {
	/** Server name */
	name: string;
	/** Tools provided by this server */
	tools: Tool[];
}

// ============================================================================
// Routing Types
// ============================================================================

/**
 * Context available during email processing
 */
export interface EmailContext {
	/** The parsed email */
	email: ParsedEmail;
	/** Logger instance */
	logger: Logger;
	/** Send a reply to this email */
	sendReply: (options: ReplyOptions) => Promise<void>;
	/** The matched route */
	route: Route;
}

/**
 * Tool context available during tool execution
 */
export interface ToolContext extends EmailContext {
	/** Access to all attachments by filename */
	getAttachment: (filename: string) => Attachment | undefined;
}

/**
 * Options for sending a reply email
 */
export interface ReplyOptions {
	/** Reply body (text) */
	text?: string;
	/** Reply body (HTML) */
	html?: string;
	/** Additional attachments */
	attachments?: Array<{
		filename: string;
		content: Buffer | string;
		contentType?: string;
	}>;
	/** Override the subject (defaults to Re: original subject) */
	subject?: string;
	/** Additional recipients */
	cc?: string[];
}

/**
 * Handler function for processing emails with AI
 */
export type EmailHandler = (
	context: EmailContext,
	ai: AIProcessor
) => Promise<HandlerResult>;

/**
 * Plain handler function for processing emails without AI
 */
export type PlainHandler = (
	context: EmailContext
) => Promise<HandlerResult>;

/**
 * Result from an email handler
 */
export interface HandlerResult {
	/** Whether processing was successful */
	success: boolean;
	/** Response to send (if any) */
	reply?: ReplyOptions;
	/** Any data extracted/processed */
	data?: unknown;
	/** Error message if not successful */
	error?: string;
}

/**
 * Route definition
 */
export interface Route {
	/** Pattern to match recipient addresses */
	match: string | RegExp | ((email: ParsedEmail) => boolean);
	/** Handler function (optional if using default AI processing) */
	handler?: EmailHandler;
	/** Plain handler (no AI) - mutually exclusive with handler */
	plainHandler?: PlainHandler;
	/** Skip AI processing entirely for this route */
	noAi?: boolean;
	/** Model to use for this route */
	model?: LanguageModel;
	/** System prompt for AI processing */
	systemPrompt?: string;
	/** Tools available for this route */
	tools?: Tool[];
	/** MCP servers to connect for this route */
	mcpServers?: MCPServerConfig[];
	/** Priority for route matching (higher = matched first) */
	priority?: number;
}

// ============================================================================
// AI Processing Types
// ============================================================================

/**
 * AI processor interface for email handling
 */
export interface AIProcessor {
	/** Process the email with AI */
	process: (options?: ProcessOptions) => Promise<ProcessResult>;
	/** Generate a structured response */
	generateObject: <T>(options: GenerateObjectOptions<T>) => Promise<T>;
}

/**
 * Options for AI processing
 */
export interface ProcessOptions {
	/** Override system prompt */
	systemPrompt?: string;
	/** Additional context messages */
	messages?: CoreMessage[];
	/** Maximum tool call iterations */
	maxSteps?: number;
}

/**
 * Options for structured object generation
 */
export interface GenerateObjectOptions<T> {
	/** Zod schema for the output */
	schema: import('zod').ZodType<T>;
	/** Prompt for generation */
	prompt?: string;
	/** System prompt override */
	systemPrompt?: string;
}

/**
 * Result from AI processing
 */
export interface ProcessResult {
	/** Generated response text */
	response: string;
	/** Tool calls that were made */
	toolCalls: ToolCallResult[];
	/** Token usage statistics */
	usage: TokenUsage;
}

/**
 * Result from a tool call
 */
export interface ToolCallResult {
	/** Tool name */
	name: string;
	/** Arguments passed to the tool */
	args: unknown;
	/** Result from the tool */
	result: unknown;
}

/**
 * Token usage statistics
 */
export interface TokenUsage {
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * SMTP server authentication configuration
 */
export interface SMTPAuthConfig {
	/** Username for authentication */
	user: string;
	/** Password for authentication */
	pass: string;
}

/**
 * SMTP server configuration
 */
export interface SMTPServerConfig {
	/** Port to listen on */
	port: number;
	/** Host to bind to */
	host?: string;
	/** Enable TLS */
	secure?: boolean;
	/** Authentication configuration (optional) */
	auth?: SMTPAuthConfig;
	/** Maximum message size in bytes */
	maxMessageSize?: number;
}

/**
 * Outgoing SMTP configuration for sending replies
 */
export interface SMTPSenderConfig {
	/** SMTP server host */
	host: string;
	/** SMTP server port */
	port: number;
	/** Use TLS */
	secure?: boolean;
	/** Authentication */
	auth?: {
		user: string;
		pass: string;
	};
	/** From address for replies */
	from?: string;
}

/**
 * Full server configuration
 */
export interface SmtcpConfig {
	/** SMTP server settings */
	server: SMTPServerConfig;
	/** Default AI settings */
	defaults?: {
		/** Default model identifier */
		model?: string;
		/** Default system prompt */
		systemPrompt?: string;
		/** Maximum processing steps */
		maxSteps?: number;
	};
	/** Route configurations */
	routes?: RouteConfig[];
	/** Global MCP servers */
	mcpServers?: MCPServerConfig[];
	/** SMTP sender configuration */
	smtp?: SMTPSenderConfig;
}

/**
 * Route configuration (for config files)
 */
export interface RouteConfig {
	/** Pattern to match */
	match: string;
	/** Path to handler file */
	handler?: string;
	/** Model identifier */
	model?: string;
	/** System prompt */
	systemPrompt?: string;
	/** Paths to tool files */
	tools?: string[];
	/** MCP server configurations */
	mcpServers?: MCPServerConfig[];
	/** Route priority */
	priority?: number;
}

// ============================================================================
// Logger Types
// ============================================================================

/**
 * Logger interface
 */
export interface Logger {
	debug: (message: string, meta?: Record<string, unknown>) => void;
	info: (message: string, meta?: Record<string, unknown>) => void;
	warn: (message: string, meta?: Record<string, unknown>) => void;
	error: (message: string, meta?: Record<string, unknown>) => void;
}

// ============================================================================
// Server Types
// ============================================================================

/**
 * Running SMTCP server instance
 */
export interface SmtcpServer {
	/** Start the server */
	start: () => Promise<void>;
	/** Stop the server */
	stop: () => Promise<void>;
	/** Server address info */
	address: () => { port: number; host: string } | null;
}
