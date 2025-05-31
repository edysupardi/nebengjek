FROM node:16-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build booking-service

FROM node:16-alpine
WORKDIR /app
COPY --from=builder /app/dist/apps/booking-service ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./

# Set default port if not provided
ENV BOOKING_PORT=3002

# Health check with dynamic port
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
  CMD node -e "require('http').request('http://localhost:' + (process.env.BOOKING_PORT || 3002) + '/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).end()"

EXPOSE ${BOOKING_PORT:-3002}
CMD ["node", "dist/main"]