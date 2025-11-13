# Production Dockerfile for Web Frontend
# --- Builder stage ---
FROM node:24-slim@sha256:f752e4821362614eab35016f01dea3af61d2f59d0445381c25683e4331520a7b AS builder

WORKDIR /opt/relab/frontend-web

# Copy package files
COPY package*.json ./

# Install dependencies
RUN --mount=type=cache,target=/root/.npm \
    npm ci --include prod

# Copy source code and build
COPY . ./
RUN npx expo export -p web -c

# --- Production stage ---
FROM node:24-slim@sha256:f752e4821362614eab35016f01dea3af61d2f59d0445381c25683e4331520a7b

# Build arguments
ARG WORKDIR=/opt/relab/frontend-web
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
