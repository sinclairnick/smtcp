/**
 * Email routing module - matches emails to handlers based on recipient
 */

import type { ParsedEmail, Route, Logger } from '../types/index.js';

export interface Router {
	/** Add a route */
	addRoute: (route: Route) => void;
	/** Find matching route for an email */
	match: (email: ParsedEmail) => Route | undefined;
	/** Get all routes */
	routes: () => Route[];
}

/**
 * Create a router for matching emails to handlers
 */
export function createRouter(logger: Logger): Router {
	const routeList: Route[] = [];

	return {
		addRoute: (route: Route) => {
			routeList.push(route);
			// Sort by priority (higher first)
			routeList.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
			logger.debug('Route added', {
				match: describeMatch(route.match),
				priority: route.priority ?? 0,
			});
		},

		match: (email: ParsedEmail) => {
			// Check all recipient addresses
			const allRecipients = [
				...email.to.map((t) => t.address),
				...(email.cc?.map((c) => c.address) ?? []),
			];

			for (const route of routeList) {
				if (matchesRoute(route, email, allRecipients)) {
					logger.debug('Route matched', {
						match: describeMatch(route.match),
						recipient: allRecipients,
					});
					return route;
				}
			}

			logger.debug('No route matched', { recipients: allRecipients });
			return undefined;
		},

		routes: () => [...routeList],
	};
}

/**
 * Check if an email matches a route
 */
function matchesRoute(
	route: Route,
	email: ParsedEmail,
	recipients: string[]
): boolean {
	const { match } = route;

	// Function matcher
	if (typeof match === 'function') {
		return match(email);
	}

	// Regex matcher
	if (match instanceof RegExp) {
		return recipients.some((r) => match.test(r));
	}

	// String pattern matcher
	return recipients.some((r) => matchPattern(match, r));
}

/**
 * Match a pattern string against an email address
 * Supports:
 * - Exact match: "bills@example.com"
 * - Wildcard user: "*@example.com"
 * - Wildcard domain: "bills@*"
 * - Full wildcard: "*"
 * - Subdomain wildcard: "*@*.example.com"
 */
function matchPattern(pattern: string, address: string): boolean {
	// Exact match
	if (!pattern.includes('*')) {
		return pattern.toLowerCase() === address.toLowerCase();
	}

	// Convert pattern to regex
	const regexPattern = pattern
		.toLowerCase()
		// Escape special regex characters except *
		.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
		// Convert * to regex
		.replace(/\*/g, '.*');

	const regex = new RegExp(`^${regexPattern}$`, 'i');
	return regex.test(address);
}

/**
 * Describe a match pattern for logging
 */
function describeMatch(
	match: string | RegExp | ((email: ParsedEmail) => boolean)
): string {
	if (typeof match === 'function') {
		return '[function]';
	}
	if (match instanceof RegExp) {
		return match.toString();
	}
	return match;
}
