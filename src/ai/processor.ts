/**
 * AI processor module - processes emails with AI models
 */

import { generateText, generateObject, type LanguageModel, type Tool, type CoreMessage } from 'ai';
import type { z } from 'zod';
import type {
	ParsedEmail,
	AIProcessor,
	ProcessOptions,
	ProcessResult,
	GenerateObjectOptions,
	ToolCallResult,
	Logger,
} from '../types/index.js';

export interface ProcessorConfig {
	/** The language model to use */
	model: LanguageModel;
	/** Default system prompt */
	systemPrompt?: string;
	/** Tools available to the model */
	tools?: Record<string, Tool>;
	/** Maximum number of tool call steps */
	maxSteps?: number;
	/** Logger instance */
	logger: Logger;
}

/**
 * Create an AI processor for a given email
 */
export function createProcessor(
	email: ParsedEmail,
	config: ProcessorConfig
): AIProcessor {
	const { model, systemPrompt, tools, maxSteps = 10, logger } = config;

	// Build the email context message
	const emailMessage = buildEmailMessage(email);

	return {
		process: async (options?: ProcessOptions): Promise<ProcessResult> => {
			const finalSystemPrompt = options?.systemPrompt ?? systemPrompt ?? getDefaultSystemPrompt();
			const additionalMessages = options?.messages ?? [];

			logger.debug('Processing email with AI', {
				model: model.modelId,
				hasTools: !!tools && Object.keys(tools).length > 0,
				maxSteps: options?.maxSteps ?? maxSteps,
			});

			const result = await generateText({
				model,
				system: finalSystemPrompt,
				messages: [emailMessage, ...additionalMessages],
				...(tools && Object.keys(tools).length > 0 ? { tools } : {}),
				maxSteps: options?.maxSteps ?? maxSteps,
			});

			const toolCalls: ToolCallResult[] = [];
			for (const step of result.steps) {
				if (step.toolCalls) {
					for (const toolCall of step.toolCalls) {
						// Find matching tool result
						let toolResultValue: unknown = undefined;
						if (step.toolResults) {
							for (const tr of step.toolResults) {
								// eslint-disable-next-line @typescript-eslint/no-explicit-any
								const trAny = tr as any;
								if (trAny.toolCallId === toolCall.toolCallId) {
									toolResultValue = trAny.result;
									break;
								}
							}
						}
						toolCalls.push({
							name: toolCall.toolName,
							args: toolCall.args,
							result: toolResultValue,
						});
					}
				}
			}

			logger.info('AI processing complete', {
				responseLength: result.text.length,
				toolCallCount: toolCalls.length,
				usage: result.usage,
			});

			return {
				response: result.text,
				toolCalls,
				usage: {
					promptTokens: result.usage.promptTokens,
					completionTokens: result.usage.completionTokens,
					totalTokens: result.usage.totalTokens,
				},
			};
		},

		generateObject: async <T>(options: GenerateObjectOptions<T>): Promise<T> => {
			const finalSystemPrompt = options.systemPrompt ?? systemPrompt ?? getDefaultSystemPrompt();
			const prompt = options.prompt ?? 'Analyze the email and extract the requested information.';

			logger.debug('Generating structured object from email', {
				model: model.modelId,
			});

			const result = await generateObject({
				model,
				system: finalSystemPrompt,
				messages: [emailMessage],
				prompt,
				schema: options.schema as z.ZodType<T>,
			});

			logger.info('Structured object generated', {
				usage: result.usage,
			});

			return result.object;
		},
	};
}

/**
 * Build a message representing the email content
 */
function buildEmailMessage(email: ParsedEmail): CoreMessage {
	const parts: string[] = [
		`From: ${email.from.name ? `${email.from.name} <${email.from.address}>` : email.from.address}`,
		`To: ${email.to.map((t) => t.name ? `${t.name} <${t.address}>` : t.address).join(', ')}`,
	];

	if (email.cc?.length) {
		parts.push(`CC: ${email.cc.map((c) => c.name ? `${c.name} <${c.address}>` : c.address).join(', ')}`);
	}

	parts.push(`Subject: ${email.subject}`);
	parts.push(`Date: ${email.date?.toISOString() ?? 'Unknown'}`);
	parts.push('');

	// Add body content
	if (email.text) {
		parts.push('--- Email Body ---');
		parts.push(email.text);
	} else if (email.html) {
		parts.push('--- Email Body (HTML) ---');
		parts.push(email.html);
	}

	// Add attachment info
	if (email.attachments.length > 0) {
		parts.push('');
		parts.push('--- Attachments ---');
		for (const att of email.attachments) {
			parts.push(`- ${att.filename} (${att.contentType}, ${formatBytes(att.size)})`);
		}
	}

	return {
		role: 'user',
		content: parts.join('\n'),
	};
}

/**
 * Default system prompt for email processing
 */
function getDefaultSystemPrompt(): string {
	return `You are an AI assistant that processes incoming emails. 
Analyze the email content and respond appropriately.
If tools are available, use them to take actions based on the email content.
Be concise and helpful in your responses.`;
}

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
