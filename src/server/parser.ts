/**
 * Email parser module - parses raw email streams into structured objects
 */

import { simpleParser, type ParsedMail, type AddressObject } from 'mailparser';
import type { Readable } from 'node:stream';
import type { ParsedEmail, EmailAddress, Attachment } from '../types/index.js';

/**
 * Parse a raw email stream or buffer into a structured ParsedEmail object
 */
export async function parseEmail(
	source: Readable | Buffer | string
): Promise<ParsedEmail> {
	const parsed = await simpleParser(source);
	return convertParsedMail(parsed);
}

/**
 * Convert mailparser's ParsedMail to our ParsedEmail type
 */
function convertParsedMail(parsed: ParsedMail): ParsedEmail {
	const cc = parsed.cc ? extractAddresses(parsed.cc) : undefined;
	const bcc = parsed.bcc ? extractAddresses(parsed.bcc) : undefined;

	return {
		messageId: parsed.messageId ?? generateMessageId(),
		from: extractSingleAddress(parsed.from) ?? { address: 'unknown@unknown' },
		to: extractAddresses(parsed.to),
		...(cc && cc.length > 0 ? { cc } : {}),
		...(bcc && bcc.length > 0 ? { bcc } : {}),
		subject: parsed.subject ?? '(no subject)',
		text: parsed.text,
		html: typeof parsed.html === 'string' ? parsed.html : undefined,
		attachments: (parsed.attachments ?? []).map((att) => convertAttachment(att)),
		headers: convertHeaders(parsed.headers),
		date: parsed.date,
		inReplyTo: parsed.inReplyTo,
		references: parsed.references
			? Array.isArray(parsed.references)
				? parsed.references
				: [parsed.references]
			: undefined,
	};
}

/**
 * Extract a single email address from an AddressObject
 */
function extractSingleAddress(
	addr: AddressObject | undefined
): EmailAddress | undefined {
	if (!addr?.value?.[0]) return undefined;
	const first = addr.value[0];
	return {
		address: first.address ?? '',
		name: first.name,
	};
}

/**
 * Extract multiple email addresses from an AddressObject or array
 */
function extractAddresses(
	addr: AddressObject | AddressObject[] | undefined
): EmailAddress[] {
	if (!addr) return [];

	const items = Array.isArray(addr) ? addr : [addr];
	const result: EmailAddress[] = [];

	for (const item of items) {
		if (item.value) {
			for (const v of item.value) {
				if (v.address) {
					result.push({
						address: v.address,
						name: v.name,
					});
				}
			}
		}
	}

	return result;
}

/**
 * Convert a mailparser attachment to our Attachment type
 */
function convertAttachment(att: {
	filename?: string;
	contentType: string;
	size: number;
	content: Buffer;
	cid?: string;
	contentDisposition?: string;
}): Attachment {
	return {
		filename: att.filename ?? 'attachment',
		contentType: att.contentType,
		size: att.size,
		content: att.content,
		...(att.cid ? { cid: att.cid } : {}),
		inline: att.contentDisposition === 'inline',
	};
}

/**
 * Convert mailparser headers to a Map
 */
function convertHeaders(
	headers: Map<string, unknown> | undefined
): Map<string, string> {
	const result = new Map<string, string>();
	if (!headers) return result;

	for (const [key, value] of headers) {
		if (typeof value === 'string') {
			result.set(key, value);
		} else if (value && typeof value === 'object' && 'text' in value) {
			result.set(key, String((value as { text: unknown }).text));
		}
	}

	return result;
}

/**
 * Generate a random message ID
 */
function generateMessageId(): string {
	const random = Math.random().toString(36).substring(2, 15);
	const timestamp = Date.now().toString(36);
	return `<${timestamp}.${random}@smtcp.local>`;
}
