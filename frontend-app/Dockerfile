# Production Dockerfile for Web Frontend
# --- Builder stage ---
FROM node:24-slim AS builder

WORKDIR /opt/relab/frontend-app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN --mount=type=cache,target=/root/.npm \
    npm ci --include prod

# Copy config files
COPY app.json tsconfig.json expo-env.d.ts ./

# Copy source code and build
COPY src/ ./src/

# Accept BUILD_MODE argument
ARG BUILD_MODE=production

# Copy the appropriate .env file based on BUILD_MODE
COPY ".env.$BUILD_MODE" .env

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
