/**
 * Standalone runtime for Docker/CLI mode
 */

import { createServer } from '../builder.js';
import { loadConfig, loadConfigFromEnv, mergeConfigs } from '../config/index.js';
import { createLogger } from '../utils/index.js';
import type { SmtcpConfig, Logger, SmtcpServer } from '../types/index.js';
import type { LanguageModel } from 'ai';

/**
 * Main entry point for standalone mode
 */
export async function main(): Promise<void> {
	const logger = createLogger({ level: 'info', prefix: 'smtcp' });

	logger.info('Starting SMTCP server...');

	try {
		// Load configuration
		const config = await loadConfiguration(logger);

		// Create and start server
		const server = await createServerFromConfig(config, logger);
		await server.start();

		const address = server.address();
		logger.info('SMTCP server running', {
			port: address?.port,
			host: address?.host,
		});

		// Handle shutdown
		const shutdown = async (signal: string) => {
			logger.info('Shutting down...', { signal });
			await server.stop();
			process.exit(0);
		};

		process.on('SIGINT', () => void shutdown('SIGINT'));
		process.on('SIGTERM', () => void shutdown('SIGTERM'));
	} catch (error) {
		logger.error('Failed to start server', {
			error: error instanceof Error ? error.message : String(error),
		});
		process.exit(1);
	}
}

/**
 * Load configuration from file and environment
 */
async function loadConfiguration(logger: Logger): Promise<SmtcpConfig> {
	const configPath = process.env['SMTCP_CONFIG'] ?? './config.yaml';
	const envConfig = loadConfigFromEnv();

	let fileConfig: Partial<SmtcpConfig> = {};

	try {
		fileConfig = loadConfig(configPath);
		logger.info('Loaded configuration from file', { path: configPath });
	} catch {
		if (process.env['SMTCP_CONFIG']) {
			// User explicitly specified a config file, so this is an error
			throw new Error(`Failed to load config file: ${configPath}`);
		}
		// No explicit config file, use defaults with env vars
		logger.info('No config file found, using environment configuration');
	}

	// Merge configs (env takes precedence)
	const config = mergeConfigs(
		{ server: { port: 2525 } }, // Defaults
		fileConfig,
		envConfig
	);

	return config;
}

/**
 * Create server from configuration
 */
async function createServerFromConfig(
	config: SmtcpConfig,
	logger: Logger
): Promise<SmtcpServer> {
	const builder = createServer({ logger });

	// Configure SMTP transport
	builder.smtp({
		port: config.server.port,
		host: config.server.host,
		secure: config.server.secure,
		auth: config.server.auth,
		maxMessageSize: config.server.maxMessageSize,
	});

	// Only set up AI if we have routes that need it
	const hasAiRoutes = config.routes?.some((r) => !r.handler) ?? true;

	if (hasAiRoutes) {
		// Resolve model from string identifier
		const model = await resolveModel(config.defaults?.model ?? 'openai:gpt-4o', logger);
		builder.model(model);
	}

	if (config.defaults?.systemPrompt) {
		builder.systemPrompt(config.defaults.systemPrompt);
	}

	// Add MCP servers
	if (config.mcpServers) {
		for (const mcpConfig of config.mcpServers) {
			builder.mcp(mcpConfig);
		}
	}

	// Add routes from config
	if (config.routes) {
		for (const route of config.routes) {
			const routeModel = route.model ? await resolveModel(route.model, logger) : undefined;

			builder.route(route.match, {
				systemPrompt: route.systemPrompt,
				model: routeModel,
				priority: route.priority,
				// TODO: Load handler and tools from paths
			});
		}
	}

	// Configure outgoing SMTP sender
	if (config.smtp) {
		builder.outgoingSmtp(config.smtp);
	}

	return builder.build();
}

/**
 * Resolve a model string to a LanguageModel instance
 */
async function resolveModel(
	modelString: string,
	logger: Logger
): Promise<LanguageModel> {
	const [provider, modelName] = modelString.includes(':')
		? (modelString.split(':', 2) as [string, string])
		: ['openai', modelString];

	logger.debug('Resolving model', { provider, modelName });

	switch (provider.toLowerCase()) {
		case 'openai': {
			const { openai } = await import('@ai-sdk/openai');
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			return openai(modelName) as any as LanguageModel;
		}
		case 'anthropic': {
			const { anthropic } = await import('@ai-sdk/anthropic');
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			return anthropic(modelName) as any as LanguageModel;
		}
		case 'google': {
			const { google } = await import('@ai-sdk/google');
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			return google(modelName) as any as LanguageModel;
		}
		default:
			throw new Error(`Unknown model provider: ${provider}`);
	}
}

// Run if executed directly
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
	void main();
}
