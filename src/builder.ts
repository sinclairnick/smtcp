/**
 * SMTCP Server Builder - Fluent API for creating email processing servers
 */

import type { LanguageModel, Tool } from 'ai';
import type {
	SmtcpServer,
	SMTPServerConfig,
	SMTPSenderConfig,
	Route,
	ParsedEmail,
	EmailHandler,
	PlainHandler,
	MCPServerConfig,
	Logger,
	EmailContext,
	HandlerResult,
	ReplyOptions,
} from './types/index.js';
import { createSmtpServer } from './server/smtp.js';
import { createWebhookServer, type WebhookServerOptions } from './server/webhook.js';
import { createEmailSender, type EmailSender } from './server/sender.js';
import { createRouter, type Router } from './routing/router.js';
import { createProcessor } from './ai/processor.js';
import { createMCPClients, aggregateMCPTools, closeMCPClients, type MCPClient } from './ai/mcp.js';
import { createLogger } from './utils/logger.js';

export interface ServerBuilderOptions {
	/** Custom logger */
	logger?: Logger;
}

export interface SmtpTransportOptions {
	/** SMTP server port */
	port: number;
	/** SMTP server host */
	host?: string;
	/** Enable TLS */
	secure?: boolean;
	/** Authentication credentials */
	auth?: { user: string; pass: string };
	/** Maximum message size in bytes */
	maxMessageSize?: number;
}

export interface HttpTransportOptions {
	/** HTTP server port */
	port: number;
	/** HTTP server host */
	host?: string;
	/** Path for the webhook endpoint */
	path?: string;
	/** Optional secret for authentication (sent as Bearer token) */
	secret?: string;
}

export interface RouteOptions {
	/** Custom handler function (receives AI processor) */
	handler?: EmailHandler;
	/** System prompt for AI processing */
	systemPrompt?: string;
	/** Tools for this route */
	tools?: Tool[];
	/** Model for this route */
	model?: LanguageModel;
	/** MCP servers for this route */
	mcpServers?: MCPServerConfig[];
	/** Route priority */
	priority?: number;
}

export interface PlainRouteOptions {
	/** Plain handler function (no AI) */
	handler: PlainHandler;
	/** Route priority */
	priority?: number;
}

/**
 * Server builder for fluent configuration
 */
export class ServerBuilder {
	private smtpConfig?: SMTPServerConfig;
	private httpConfig?: WebhookServerOptions;
	private senderConfig?: SMTPSenderConfig;
	private defaultModel?: LanguageModel;
	private defaultSystemPrompt?: string;
	private defaultTools: Record<string, Tool> = {};
	private mcpServers: MCPServerConfig[] = [];
	private routeList: Route[] = [];
	private logger: Logger;
	private hasAiRoutes = false;

	constructor(options: ServerBuilderOptions = {}) {
		this.logger = options.logger ?? createLogger();
	}

	/**
	 * Enable SMTP transport for receiving emails
	 */
	smtp(options: SmtpTransportOptions): this {
		this.smtpConfig = {
			port: options.port,
			host: options.host,
			secure: options.secure,
			auth: options.auth,
			maxMessageSize: options.maxMessageSize,
		};
		return this;
	}

	/**
	 * Enable HTTP transport for receiving emails via webhook
	 */
	http(options: HttpTransportOptions): this {
		this.httpConfig = {
			port: options.port,
			host: options.host,
			path: options.path ?? '/webhook',
			secret: options.secret,
		};
		return this;
	}

	/**
	 * Set the default language model
	 */
	model(model: LanguageModel): this {
		this.defaultModel = model;
		return this;
	}

	/**
	 * Set the default system prompt
	 */
	systemPrompt(prompt: string): this {
		this.defaultSystemPrompt = prompt;
		return this;
	}

	/**
	 * Add a tool available to all routes
	 */
	tool(name: string, tool: Tool): this {
		this.defaultTools[name] = tool;
		return this;
	}

	/**
	 * Add multiple tools
	 */
	tools(tools: Record<string, Tool>): this {
		Object.assign(this.defaultTools, tools);
		return this;
	}

	/**
	 * Add an MCP server
	 */
	mcp(config: MCPServerConfig): this {
		this.mcpServers.push(config);
		return this;
	}

	/**
	 * Add a route with AI processing
	 */
	route(pattern: string | RegExp | ((email: ParsedEmail) => boolean), options: RouteOptions = {}): this {
		this.hasAiRoutes = true;
		this.routeList.push({
			match: pattern,
			handler: options.handler,
			model: options.model,
			systemPrompt: options.systemPrompt,
			tools: options.tools,
			mcpServers: options.mcpServers,
			priority: options.priority,
		});
		return this;
	}

	/**
	 * Add a plain route WITHOUT AI processing
	 * Use this for simple handlers that don't need AI
	 */
	plainRoute(pattern: string | RegExp | ((email: ParsedEmail) => boolean), options: PlainRouteOptions): this {
		this.routeList.push({
			match: pattern,
			plainHandler: options.handler,
			noAi: true,
			priority: options.priority,
		});
		return this;
	}

	/**
	 * Configure outgoing SMTP for sending replies
	 */
	outgoingSmtp(config: SMTPSenderConfig): this {
		this.senderConfig = config;
		return this;
	}

	/**
	 * Set custom logger
	 */
	useLogger(logger: Logger): this {
		this.logger = logger;
		return this;
	}

	/**
	 * Build and return the server (does not start it)
	 */
	async build(): Promise<SmtcpServer> {
		// Validate: at least one transport must be configured
		if (!this.smtpConfig && !this.httpConfig) {
			throw new Error('At least one transport must be configured. Use .smtp() or .http() to configure a transport.');
		}

		// Only require a model if there are AI routes
		if (this.hasAiRoutes && !this.defaultModel) {
			throw new Error('A default model must be configured for AI routes. Use .model() to set one, or use .plainRoute() for non-AI handlers.');
		}

		const router = createRouter(this.logger);
		for (const route of this.routeList) {
			router.addRoute(route);
		}

		// Create MCP clients (only if we have AI routes)
		let mcpClients: MCPClient[] = [];
		let mcpTools: Record<string, Tool> = {};
		if (this.hasAiRoutes && this.mcpServers.length > 0) {
			mcpClients = await createMCPClients(this.mcpServers, this.logger);
			mcpTools = await aggregateMCPTools(mcpClients);
		}

		// Create email sender if configured
		const sender = this.senderConfig
			? createEmailSender(this.senderConfig, this.logger)
			: undefined;

		// Store references for the handler closure
		const defaultModel = this.defaultModel;
		const defaultSystemPrompt = this.defaultSystemPrompt;
		const defaultTools = { ...this.defaultTools, ...mcpTools };
		const logger = this.logger;

		// Email handler function (shared by all transports)
		const onEmail = async (email: ParsedEmail) => {
			await handleEmail(email, {
				router,
				sender,
				defaultModel,
				defaultSystemPrompt,
				defaultTools,
				mcpClients,
				logger,
			});
		};

		// Create transports
		const smtpServer = this.smtpConfig
			? createSmtpServer(
				this.smtpConfig,
				{
					onEmail,
					onError: (error) => {
						logger.error('SMTP transport error', { error: error.message });
					},
				},
				logger
			)
			: undefined;

		const httpServer = this.httpConfig
			? createWebhookServer(
				this.httpConfig,
				{
					onEmail,
					onError: (error) => {
						logger.error('HTTP transport error', { error: error.message });
					},
				},
				logger
			)
			: undefined;

		return {
			start: async () => {
				if (smtpServer) {
					await smtpServer.start();
				}
				if (httpServer) {
					await httpServer.start();
				}
			},
			stop: async () => {
				if (smtpServer) {
					await smtpServer.stop();
				}
				if (httpServer) {
					await httpServer.stop();
				}
				await closeMCPClients(mcpClients);
				await sender?.close();
			},
			address: () => {
				// Return SMTP address if available, otherwise HTTP
				if (smtpServer) {
					return smtpServer.address();
				}
				if (httpServer) {
					return httpServer.address();
				}
				return null;
			},
		};
	}

	/**
	 * Build and start the server
	 */
	async start(): Promise<SmtcpServer> {
		const server = await this.build();
		await server.start();
		return server;
	}
}

interface EmailHandlerContext {
	router: Router;
	sender?: EmailSender;
	defaultModel?: LanguageModel;
	defaultSystemPrompt?: string;
	defaultTools: Record<string, Tool>;
	mcpClients: MCPClient[];
	logger: Logger;
}

/**
 * Handle an incoming email
 */
async function handleEmail(
	email: ParsedEmail,
	ctx: EmailHandlerContext
): Promise<void> {
	const { router, sender, defaultModel, defaultSystemPrompt, defaultTools, logger } = ctx;

	// Find matching route
	const route = router.match(email);

	if (!route) {
		logger.warn('No route matched for email', {
			from: email.from.address,
			to: email.to.map((t) => t.address),
			subject: email.subject,
		});
		return;
	}

	// Build email context
	const emailContext: EmailContext = {
		email,
		logger,
		route,
		sendReply: async (options: ReplyOptions) => {
			if (!sender) {
				throw new Error('Outgoing SMTP not configured. Use .outgoingSmtp() to configure email sending.');
			}
			await sender.sendReply(email, options);
		},
	};

	let result: HandlerResult;

	// Check if this is a non-AI route
	if (route.noAi || route.plainHandler) {
		if (route.plainHandler) {
			try {
				result = await route.plainHandler(emailContext);
			} catch (error) {
				logger.error('Plain handler error', {
					error: error instanceof Error ? error.message : String(error),
				});
				result = {
					success: false,
					error: error instanceof Error ? error.message : String(error),
				};
			}
		} else {
			// noAi flag but no handler - just log and succeed
			logger.info('Non-AI route matched, no handler defined');
			result = { success: true };
		}
	} else {
		// AI route
		if (!defaultModel) {
			logger.error('No model configured for AI route');
			result = { success: false, error: 'No model configured' };
		} else {
			// Get model and tools for this route
			const model = route.model ?? defaultModel;
			const systemPrompt = route.systemPrompt ?? defaultSystemPrompt;
			const routeTools: Record<string, Tool> = { ...defaultTools };

			if (route.tools) {
				for (const tool of route.tools) {
					routeTools[`route_${Object.keys(routeTools).length}`] = tool;
				}
			}

			// Create AI processor
			const processor = createProcessor(email, {
				model,
				systemPrompt,
				tools: Object.keys(routeTools).length > 0 ? routeTools : undefined,
				logger,
			});

			if (route.handler) {
				// Use custom handler with AI
				try {
					result = await route.handler(emailContext, processor);
				} catch (error) {
					logger.error('Handler error', {
						error: error instanceof Error ? error.message : String(error),
					});
					result = {
						success: false,
						error: error instanceof Error ? error.message : String(error),
					};
				}
			} else {
				// Default: process with AI and optionally reply
				try {
					const aiResult = await processor.process();

					result = {
						success: true,
						data: {
							response: aiResult.response,
							toolCalls: aiResult.toolCalls,
						},
					};

					// Auto-reply if we have a sender and the AI generated a response
					if (sender && aiResult.response) {
						result.reply = { text: aiResult.response };
					}
				} catch (error) {
					logger.error('AI processing error', {
						error: error instanceof Error ? error.message : String(error),
					});
					result = {
						success: false,
						error: error instanceof Error ? error.message : String(error),
					};
				}
			}
		}
	}

	// Send reply if specified
	if (result.reply && sender) {
		try {
			await sender.sendReply(email, result.reply);
		} catch (error) {
			logger.error('Failed to send reply', {
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	logger.info('Email processed', {
		messageId: email.messageId,
		success: result.success,
		hasReply: !!result.reply,
		noAi: route.noAi ?? false,
	});
}

/**
 * Create a new SMTCP server builder
 */
export function createServer(options?: ServerBuilderOptions): ServerBuilder {
	return new ServerBuilder(options);
}
