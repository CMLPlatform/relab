# Production Dockerfile for Web Frontend
# --- Builder stage ---
FROM node:24-slim AS builder

WORKDIR /opt/relab/frontend-app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN --mount=type=cache,target=/root/.npm \
    npm ci --include prod

# Copy source code and build
COPY . ./

# Accept BUILD_MODE argument
ARG BUILD_MODE=production

# If BUILD_MODE is not production, copy the corresponding env file
RUN if [ "$BUILD_MODE" != "production" ] && [ -f ".env.$BUILD_MODE" ]; then cp ".env.$BUILD_MODE" .env; fi

RUN npx expo export -p web -c

# --- Production stage ---
FROM node:24-slim

# Build arguments
ARG WORKDIR=/opt/relab/frontend-app
ARG APP_USER=appuser

# Set the working directory
WORKDIR $WORKDIR

# Install serve for static file serving
RUN npm install -g serve

# Set up a non-root user
RUN useradd $APP_USER

# Copy the build output
COPY --from=builder --chown=$APP_USER:$APP_USER $WORKDIR/dist $WORKDIR/dist

EXPOSE 8081

USER $APP_USER

# Serve the static build
CMD ["serve", "-s", "dist", "-l", "8081"]
