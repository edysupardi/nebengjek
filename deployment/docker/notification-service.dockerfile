FROM node:16-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build notification-service

FROM node:16-alpine
WORKDIR /app
COPY --from=builder /app/dist/apps/notification-service ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./

# Set default ports if not provided
ENV NOTIFICATION_PORT=3004
ENV NOTIFICATION_WS_PORT=3050

# Health check with dynamic port
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
  CMD node -e "require('http').request('http://localhost:' + (process.env.NOTIFICATION_PORT || 3004) + '/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).end()"

EXPOSE ${NOTIFICATION_PORT:-3004}
# Expose WebSocket port
EXPOSE ${NOTIFICATION_WS_PORT:-3050}
CMD ["node", "dist/main"]