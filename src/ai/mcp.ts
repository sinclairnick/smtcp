/**
 * MCP integration module - connects to MCP servers and hosts inline servers
 */

import { experimental_createMCPClient } from '@ai-sdk/mcp';
import type { Tool } from 'ai';
import type { MCPServerConfig, Logger } from '../types/index.js';

export interface MCPClient {
	/** Client name */
	name: string;
	/** Get tools from this client */
	tools: () => Promise<Record<string, Tool>>;
	/** Close the client connection */
	close: () => Promise<void>;
}

/**
 * Create MCP clients from configuration
 */
export async function createMCPClients(
	configs: MCPServerConfig[],
	logger: Logger
): Promise<MCPClient[]> {
	const clients: MCPClient[] = [];

	for (const config of configs) {
		try {
			const client = await createMCPClient(config, logger);
			clients.push(client);
			logger.info('MCP client connected', { name: config.name, type: config.type });
		} catch (error) {
			logger.error('Failed to connect MCP client', {
				name: config.name,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	return clients;
}

/**
 * Create a single MCP client
 */
async function createMCPClient(
	config: MCPServerConfig,
	logger: Logger
): Promise<MCPClient> {
	let mcpClient: Awaited<ReturnType<typeof experimental_createMCPClient>>;

	if (config.type === 'stdio') {
		if (!config.command) {
			throw new Error(`MCP server ${config.name} requires 'command' for stdio transport`);
		}

		// For stdio, we need to spawn the process
		// Use the experimental SSE transport for now as stdio may require additional setup
		logger.warn('Stdio MCP transport requires manual setup - using command directly', {
			command: config.command,
			args: config.args,
		});

		// Create transport with spawn for stdio
		const { spawn } = await import('node:child_process');
		const childProcess = spawn(config.command, config.args ?? [], {
			env: { ...process.env, ...config.env },
			stdio: ['pipe', 'pipe', 'pipe'],
		});

		// This is a simplified stdio transport wrapper
		// In production, you'd want a proper MCP stdio transport
		mcpClient = await experimental_createMCPClient({
			transport: {
				type: 'sse' as const,
				url: 'http://localhost:0', // Placeholder - stdio needs custom handling
			},
		});

		// Close the child process when done
		const originalClose = mcpClient.close.bind(mcpClient);
		mcpClient.close = async () => {
			childProcess.kill();
			await originalClose();
		};
	} else if (config.type === 'http' || config.type === 'sse') {
		if (!config.url) {
			throw new Error(`MCP server ${config.name} requires 'url' for ${config.type} transport`);
		}

		mcpClient = await experimental_createMCPClient({
			transport: {
				type: config.type,
				url: config.url,
			},
		});
	} else {
		throw new Error(`Unsupported MCP transport type: ${config.type}`);
	}

	return {
		name: config.name,
		tools: async () => {
			const tools = await mcpClient.tools();
			logger.debug('Retrieved MCP tools', {
				name: config.name,
				toolCount: Object.keys(tools).length,
			});
			// Cast to our Tool type since MCP tools should be compatible
			return tools as unknown as Record<string, Tool>;
		},
		close: async () => {
			await mcpClient.close();
			logger.debug('MCP client closed', { name: config.name });
		},
	};
}

/**
 * Aggregate tools from multiple MCP clients
 */
export async function aggregateMCPTools(
	clients: MCPClient[]
): Promise<Record<string, Tool>> {
	const allTools: Record<string, Tool> = {};

	for (const client of clients) {
		const tools = await client.tools();
		for (const [name, tool] of Object.entries(tools)) {
			// Prefix with client name to avoid collisions
			const prefixedName = `${client.name}_${name}`;
			allTools[prefixedName] = tool;
		}
	}

	return allTools;
}

/**
 * Close all MCP clients
 */
export async function closeMCPClients(clients: MCPClient[]): Promise<void> {
	await Promise.all(clients.map((c) => c.close()));
}
