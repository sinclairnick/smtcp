# SMTCP

AI-powered email processing framework with MCP integration.

## Overview

SMTCP enables you to receive emails via SMTP or HTTP, process them with AI models, call tools/MCPs, and optionally send responses. Perfect for automating email workflows like bill processing, support inquiries, and data extraction.

## Installation

```bash
pnpm add smtcp
# or
npm install smtcp
```

You'll also need at least one AI provider (only if using AI routes):

```bash
pnpm add @ai-sdk/openai
# or @ai-sdk/anthropic, @ai-sdk/google
```

## Quick Start

### AI-Powered Email Processing

```typescript
import { createServer, createTool } from 'smtcp';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

const server = await createServer()
  .smtp({ port: 2525 })  // Enable SMTP transport
  .model(openai('gpt-4o'))
  .systemPrompt('You process incoming emails.')
  .route('bills@*', { systemPrompt: 'Extract invoice details.' })
  .route('*', { systemPrompt: 'Summarize this email.' })
  .start();

console.log('SMTCP server running on port 2525');
```

### Non-AI Processing

```typescript
import { createServer } from 'smtcp';

// No AI model required!
const server = await createServer()
  .http({ port: 3000, path: '/webhook' })  // HTTP only
  .plainRoute('notifications@*', {
    handler: async (ctx) => {
      console.log('Received:', ctx.email.subject);
      return { success: true };
    },
  })
  .start();
```

### Both Transports

```typescript
const server = await createServer()
  .smtp({ port: 2525 })                    // SMTP transport
  .http({ port: 3000, secret: 'my-key' })  // HTTP transport
  .model(openai('gpt-4o'))
  .route('*', { systemPrompt: '...' })
  .start();
```

## Features

- **SMTP Transport**: Receive emails directly via SMTP server
- **HTTP Transport**: Receive emails via REST API webhook
- **AI Processing**: Process emails with any AI model via Vercel AI SDK
- **Non-AI Handlers**: Define plain handlers that skip AI entirely
- **MCP Integration**: Connect to MCP servers for extended capabilities
- **Routing**: Route emails to different handlers based on recipient
- **Tools**: Define custom tools for AI to call
- **Replies**: Optionally send AI-generated responses

## Transports

SMTP and HTTP are equal transport options. Configure one or both:

### SMTP Transport

```typescript
createServer()
  .smtp({
    port: 2525,           // Required
    host: '0.0.0.0',      // Optional, default: 0.0.0.0
    secure: false,        // Optional, enable TLS
    auth: { user, pass }, // Optional authentication
    maxMessageSize: 25 * 1024 * 1024, // Optional, default 25MB
  })
```

### HTTP Transport

```typescript
createServer()
  .http({
    port: 3000,           // Required
    host: '0.0.0.0',      // Optional
    path: '/webhook',     // Optional, default: /webhook
    secret: 'my-secret',  // Optional, Bearer token auth
  })
```

POST JSON to the webhook endpoint:

```json
{
  "from": { "address": "sender@example.com", "name": "Sender" },
  "to": [{ "address": "recipient@example.com" }],
  "subject": "Hello",
  "text": "Email body content",
  "html": "<p>Optional HTML body</p>",
  "attachments": [
    { "filename": "file.pdf", "contentType": "application/pdf", "content": "base64..." }
  ]
}
```

## Routing

Route emails based on recipient address patterns:

```typescript
server
  .route('bills@example.com', { ... })  // Exact match
  .route('*@support.example.com', { ... })  // Wildcard user
  .route('invoices@*', { ... })  // Wildcard domain
  .route(/^urgent-.*@/, { ... })  // Regex
  .route((email) => email.attachments.length > 0, { ... })  // Function
  .plainRoute('logs@*', { handler: ... })  // Non-AI handler
```

## MCP Integration

Connect to external MCP servers:

```typescript
server.mcp({
  name: 'filesystem',
  type: 'sse',
  url: 'http://localhost:3001/sse',
})
```

## Docker Deployment

```bash
docker build -t smtcp .
docker run -p 2525:25 \
  -v ./config.yaml:/config/config.yaml \
  -e OPENAI_API_KEY=$OPENAI_API_KEY \
  smtcp
```

## Configuration

### Config File (config.yaml)

```yaml
server:
  port: 25

defaults:
  model: openai:gpt-4o
  systemPrompt: |
    You are an AI assistant that processes incoming emails.

routes:
  - match: "bills@*"
    systemPrompt: "Extract invoice information."
  - match: "*"
    priority: -100

smtp:  # Outgoing SMTP for replies
  host: smtp.example.com
  port: 587
  auth:
    user: ${SMTP_USER}
    pass: ${SMTP_PASS}
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `SMTCP_PORT` | SMTP server port |
| `SMTCP_CONFIG` | Path to config file |
| `OPENAI_API_KEY` | OpenAI API key |
| `ANTHROPIC_API_KEY` | Anthropic API key |

## API Reference

### `createServer(options?)`

Create a new SMTCP server builder.

```typescript
const server = createServer({
  logger: myCustomLogger,  // Optional
});
```

### Builder Methods

**Transports:**
- `.smtp(options)` - Enable SMTP transport
- `.http(options)` - Enable HTTP transport

**AI Configuration:**
- `.model(model)` - Set default AI model (required for AI routes)
- `.systemPrompt(prompt)` - Set default system prompt
- `.tool(name, tool)` - Add a tool
- `.mcp(config)` - Add MCP server

**Routing:**
- `.route(pattern, options)` - Add AI-powered route
- `.plainRoute(pattern, options)` - Add non-AI route

**Other:**
- `.outgoingSmtp(config)` - Configure outgoing SMTP for replies
- `.build()` - Build server (async)
- `.start()` - Build and start (async)

### `createTool(config)`

Create a tool for AI to call:

```typescript
const myTool = createTool({
  description: 'Tool description',
  parameters: z.object({ ... }),
  execute: async (params) => { ... },
});
```

## License

MIT
