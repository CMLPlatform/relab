# Production Dockerfile for Expo React Frontend
# --- Builder stage ---
FROM node:24-slim AS builder

WORKDIR /opt/relab/frontend

# Copy package files
COPY package*.json ./

# Install dependencies
RUN --mount=type=cache,target=/root/.npm \
    npm ci --include prod

# Copy source code and build
COPY . ./
RUN npx expo export -p web -c

# --- Production stage ---
FROM node:24-slim

# Build arguments
ARG WORKDIR=/opt/relab/frontend
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
