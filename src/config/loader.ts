/**
 * Configuration loader - loads configuration from YAML/JSON files
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { SmtcpConfig, RouteConfig, MCPServerConfig } from '../types/index.js';

/**
 * Load configuration from a file
 */
export function loadConfig(filePath: string): SmtcpConfig {
	const absolutePath = resolve(filePath);

	if (!existsSync(absolutePath)) {
		throw new Error(`Configuration file not found: ${absolutePath}`);
	}

	const content = readFileSync(absolutePath, 'utf-8');
	const ext = absolutePath.toLowerCase();

	let rawConfig: unknown;

	if (ext.endsWith('.yaml') || ext.endsWith('.yml')) {
		rawConfig = parseYaml(content);
	} else if (ext.endsWith('.json')) {
		rawConfig = JSON.parse(content);
	} else {
		// Try YAML first, then JSON
		try {
			rawConfig = parseYaml(content);
		} catch {
			rawConfig = JSON.parse(content);
		}
	}

	return validateConfig(rawConfig);
}

/**
 * Load configuration from environment variables
 */
export function loadConfigFromEnv(): Partial<SmtcpConfig> {
	const config: Partial<SmtcpConfig> = {};

	// Server configuration
	const port = process.env['SMTCP_PORT'];
	const host = process.env['SMTCP_HOST'];
	const secure = process.env['SMTCP_SECURE'];
	const authUser = process.env['SMTCP_AUTH_USER'];
	const authPass = process.env['SMTCP_AUTH_PASS'];

	if (port || host || secure) {
		config.server = {
			port: port ? parseInt(port, 10) : 2525,
			host: host,
			secure: secure === 'true',
		};

		if (authUser && authPass) {
			config.server.auth = { user: authUser, pass: authPass };
		}
	}

	// Default settings
	const model = process.env['SMTCP_DEFAULT_MODEL'];
	const systemPrompt = process.env['SMTCP_DEFAULT_SYSTEM_PROMPT'];
	const maxSteps = process.env['SMTCP_DEFAULT_MAX_STEPS'];

	if (model || systemPrompt || maxSteps) {
		config.defaults = {
			model,
			systemPrompt,
			maxSteps: maxSteps ? parseInt(maxSteps, 10) : undefined,
		};
	}

	// SMTP sender configuration
	const smtpHost = process.env['SMTP_HOST'];
	const smtpPort = process.env['SMTP_PORT'];
	const smtpUser = process.env['SMTP_USER'];
	const smtpPass = process.env['SMTP_PASS'];
	const smtpFrom = process.env['SMTP_FROM'];

	if (smtpHost) {
		config.smtp = {
			host: smtpHost,
			port: smtpPort ? parseInt(smtpPort, 10) : 587,
			secure: process.env['SMTP_SECURE'] === 'true',
			from: smtpFrom,
		};

		if (smtpUser && smtpPass) {
			config.smtp.auth = { user: smtpUser, pass: smtpPass };
		}
	}

	return config;
}

/**
 * Merge configurations with priority (later configs override earlier)
 */
export function mergeConfigs(...configs: Partial<SmtcpConfig>[]): SmtcpConfig {
	const result: SmtcpConfig = {
		server: { port: 2525 },
	};

	for (const config of configs) {
		if (config.server) {
			result.server = { ...result.server, ...config.server };
		}
		if (config.defaults) {
			result.defaults = { ...result.defaults, ...config.defaults };
		}
		if (config.routes) {
			result.routes = [...(result.routes ?? []), ...config.routes];
		}
		if (config.mcpServers) {
			result.mcpServers = [...(result.mcpServers ?? []), ...config.mcpServers];
		}
		if (config.smtp) {
			result.smtp = { ...result.smtp, ...config.smtp };
		}
	}

	return result;
}

/**
 * Validate and normalize configuration
 */
function validateConfig(raw: unknown): SmtcpConfig {
	if (!raw || typeof raw !== 'object') {
		throw new Error('Configuration must be an object');
	}

	const obj = raw as Record<string, unknown>;

	// Validate server config
	const server = obj['server'];
	if (!server || typeof server !== 'object') {
		throw new Error('Configuration must include a server section');
	}

	const serverObj = server as Record<string, unknown>;
	const port = serverObj['port'];
	if (typeof port !== 'number' || port < 1 || port > 65535) {
		throw new Error('Server port must be a valid port number');
	}

	const config: SmtcpConfig = {
		server: {
			port,
			host: typeof serverObj['host'] === 'string' ? serverObj['host'] : undefined,
			secure: typeof serverObj['secure'] === 'boolean' ? serverObj['secure'] : undefined,
			maxMessageSize:
				typeof serverObj['maxMessageSize'] === 'number' ? serverObj['maxMessageSize'] : undefined,
		},
	};

	// Parse auth
	const auth = serverObj['auth'];
	if (auth && typeof auth === 'object') {
		const authObj = auth as Record<string, unknown>;
		if (typeof authObj['user'] === 'string' && typeof authObj['pass'] === 'string') {
			config.server.auth = { user: authObj['user'], pass: authObj['pass'] };
		}
	}

	// Parse defaults
	const defaults = obj['defaults'];
	if (defaults && typeof defaults === 'object') {
		const defaultsObj = defaults as Record<string, unknown>;
		config.defaults = {
			model: typeof defaultsObj['model'] === 'string' ? defaultsObj['model'] : undefined,
			systemPrompt:
				typeof defaultsObj['systemPrompt'] === 'string' ? defaultsObj['systemPrompt'] : undefined,
			maxSteps: typeof defaultsObj['maxSteps'] === 'number' ? defaultsObj['maxSteps'] : undefined,
		};
	}

	// Parse routes
	const routes = obj['routes'];
	if (Array.isArray(routes)) {
		config.routes = routes.map(parseRouteConfig);
	}

	// Parse MCP servers
	const mcpServers = obj['mcpServers'];
	if (Array.isArray(mcpServers)) {
		config.mcpServers = mcpServers.map(parseMCPServerConfig);
	}

	// Parse SMTP sender config
	const smtp = obj['smtp'];
	if (smtp && typeof smtp === 'object') {
		const smtpObj = smtp as Record<string, unknown>;
		if (typeof smtpObj['host'] === 'string') {
			config.smtp = {
				host: smtpObj['host'],
				port: typeof smtpObj['port'] === 'number' ? smtpObj['port'] : 587,
				secure: typeof smtpObj['secure'] === 'boolean' ? smtpObj['secure'] : undefined,
				from: typeof smtpObj['from'] === 'string' ? smtpObj['from'] : undefined,
			};

			const smtpAuth = smtpObj['auth'];
			if (smtpAuth && typeof smtpAuth === 'object') {
				const smtpAuthObj = smtpAuth as Record<string, unknown>;
				if (typeof smtpAuthObj['user'] === 'string' && typeof smtpAuthObj['pass'] === 'string') {
					config.smtp.auth = { user: smtpAuthObj['user'], pass: smtpAuthObj['pass'] };
				}
			}
		}
	}

	return config;
}

/**
 * Parse a route configuration object
 */
function parseRouteConfig(raw: unknown): RouteConfig {
	if (!raw || typeof raw !== 'object') {
		throw new Error('Route configuration must be an object');
	}

	const obj = raw as Record<string, unknown>;

	if (typeof obj['match'] !== 'string') {
		throw new Error('Route must have a match pattern');
	}

	return {
		match: obj['match'],
		handler: typeof obj['handler'] === 'string' ? obj['handler'] : undefined,
		model: typeof obj['model'] === 'string' ? obj['model'] : undefined,
		systemPrompt: typeof obj['systemPrompt'] === 'string' ? obj['systemPrompt'] : undefined,
		tools: Array.isArray(obj['tools']) ? obj['tools'].filter((t) => typeof t === 'string') : undefined,
		mcpServers: Array.isArray(obj['mcpServers'])
			? obj['mcpServers'].map(parseMCPServerConfig)
			: undefined,
		priority: typeof obj['priority'] === 'number' ? obj['priority'] : undefined,
	};
}

/**
 * Parse an MCP server configuration object
 */
function parseMCPServerConfig(raw: unknown): MCPServerConfig {
	if (!raw || typeof raw !== 'object') {
		throw new Error('MCP server configuration must be an object');
	}

	const obj = raw as Record<string, unknown>;

	if (typeof obj['name'] !== 'string') {
		throw new Error('MCP server must have a name');
	}

	const type = obj['type'];
	if (type !== 'http' && type !== 'sse' && type !== 'stdio') {
		throw new Error('MCP server type must be one of: http, sse, stdio');
	}

	return {
		name: obj['name'],
		type,
		url: typeof obj['url'] === 'string' ? obj['url'] : undefined,
		command: typeof obj['command'] === 'string' ? obj['command'] : undefined,
		args: Array.isArray(obj['args']) ? obj['args'].filter((a) => typeof a === 'string') : undefined,
		env:
			obj['env'] && typeof obj['env'] === 'object'
				? Object.fromEntries(
					Object.entries(obj['env'] as Record<string, unknown>)
						.filter(([, v]) => typeof v === 'string')
						.map(([k, v]) => [k, v as string])
				)
				: undefined,
	};
}
