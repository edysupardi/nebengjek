FROM node:22-alpine AS builder
WORKDIR /app

# No need for build tools anymore since bcryptjs is pure JavaScript
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci

# Generate Prisma client for Linux
RUN npx prisma generate --schema=./prisma/schema.prisma

# Copy application code
COPY . .

# Build the application
RUN npm run build user-service

FROM node:22-alpine
WORKDIR /app

# Copy built application and dependencies
COPY --from=builder /app/dist/apps/user-service ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY package*.json ./

# Environment setup
ENV USER_PORT=3001

# Health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
  CMD node -e "require('http').request('http://localhost:' + (process.env.USER_PORT || 3001) + '/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).end()"

EXPOSE ${USER_PORT:-3001}
CMD ["node", "dist/main"]