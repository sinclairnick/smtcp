/**
 * Tool definition helpers
 */

import { tool } from 'ai';
import type { z } from 'zod';
import type { Tool } from 'ai';
import type { ToolContext } from '../types/index.js';

export type { Tool } from 'ai';

/**
 * Define a tool with access to email context
 */
export function defineTool<TParams extends z.ZodType, TResult>(config: {
	/** Tool name */
	name: string;
	/** Tool description for the AI */
	description: string;
	/** Zod schema for parameters */
	parameters: TParams;
	/** Tool execution function */
	execute: (params: z.infer<TParams>, context: ToolContext) => Promise<TResult>;
}) {
	// Return a factory that creates tools with context
	return {
		name: config.name,
		withContext: (context: ToolContext) =>
			tool({
				description: config.description,
				parameters: config.parameters,
				execute: async (params) => config.execute(params, context),
			}),
	};
}

/**
 * Bind tools to a context for execution
 */
export function bindToolsToContext(
	tools: Array<ReturnType<typeof defineTool>>,
	context: ToolContext
): Record<string, Tool> {
	const bound: Record<string, Tool> = {};

	for (const t of tools) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		bound[t.name] = t.withContext(context) as any;
	}

	return bound;
}

/**
 * Create a simple tool without context requirements
 */
export function createTool<TParams extends z.ZodType, TResult>(config: {
	/** Tool description for the AI */
	description: string;
	/** Zod schema for parameters */
	parameters: TParams;
	/** Tool execution function */
	execute: (params: z.infer<TParams>) => Promise<TResult>;
}) {
	return tool({
		description: config.description,
		parameters: config.parameters,
		execute: config.execute,
	});
}
