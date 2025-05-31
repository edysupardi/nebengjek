FROM node:22-alpine AS builder
WORKDIR /app

# Copy package files and Prisma schema
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci

# Generate Prisma client for Linux
RUN npx prisma generate --schema=./prisma/schema.prisma

# Copy application code
COPY . .

# Build the application
RUN npm run build notification-service

FROM node:22-alpine
WORKDIR /app

# Copy built application and dependencies
COPY --from=builder /app/dist/apps/notification-service ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY package*.json ./

# Environment setup
ENV NOTIFICATION_PORT=3004
ENV NOTIFICATION_WS_PORT=3050

# Health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
  CMD node -e "require('http').request('http://localhost:' + (process.env.NOTIFICATION_PORT || 3004) + '/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).end()"

EXPOSE ${NOTIFICATION_PORT:-3004}
EXPOSE ${NOTIFICATION_WS_PORT:-3050}
CMD ["node", "dist/main"]