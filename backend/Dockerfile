# FieldLedger - Backend Dockerfile
# Multi-stage build for optimized production image

# ============================================
# Stage 1: Dependencies
# ============================================
FROM node:22-alpine AS deps

WORKDIR /app

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++ cairo-dev pango-dev jpeg-dev giflib-dev

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production --ignore-optional

# ============================================
# Stage 2: Production
# ============================================
FROM node:22-alpine AS production

WORKDIR /app

# Install runtime dependencies for canvas/sharp
RUN apk add --no-cache cairo pango jpeg giflib fontconfig

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

# Create uploads directory with proper permissions (before switching user)
RUN mkdir -p /app/uploads && chown nodejs:nodejs /app/uploads

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application code
COPY --chown=nodejs:nodejs . .

# Remove unnecessary files
RUN rm -rf __tests__ ./scripts/*.js ./*.md .git

# Switch to non-root user
USER nodejs

# Expose port (Railway sets PORT dynamically, default 5000 for local)
EXPOSE ${PORT:-5000}

# Set default port for local development
ENV PORT=5000

# Health check - uses PORT env var for Railway compatibility
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD node -e "const port = process.env.PORT || 5000; require('http').get('http://localhost:' + port + '/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Start server with memory management flags
# --max-old-space-size: Set explicit heap limit (Railway default container is 512MB)
# --expose-gc: Allow manual GC hints after heavy PDF processing
CMD ["node", "--max-old-space-size=450", "--expose-gc", "server.js"]

