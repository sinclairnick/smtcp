# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code and config
COPY tsconfig.json ./
COPY src ./src

# Build the project
RUN pnpm run build

# Final stage
FROM node:22-alpine

WORKDIR /app

# Install pnpm (needed for runtime if we use pnpm start, or just use node)
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile

# Copy compiled files from builder
COPY --from=builder /app/dist ./dist

# Create config directory
RUN mkdir -p /config

# Default environment variables
ENV NODE_ENV=production
ENV SMTCP_CONFIG=/config/config.yaml

# Expose default SMTP and optional HTTP ports
EXPOSE 25
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "require('net').createConnection(25, '127.0.0.1').on('error', () => process.exit(1)).end()"

# Run the standalone runtime
CMD ["node", "dist/runtime/cli.js"]
