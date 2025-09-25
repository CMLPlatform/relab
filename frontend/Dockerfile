# Production Dockerfile for Expo React Frontend
# --- Builder stage ---
FROM node:24-slim AS builder

WORKDIR /opt/relab/frontend

# Install dependencies
RUN --mount=type=cache,target=/root/.npm \
    --mount=type=bind,source=package.json,target=package.json \
    --mount=type=bind,source=package-lock.json,target=package-lock.json \
    npm install

# Copy source code and build
COPY . ./
RUN npx expo export -p web -c

# --- Production stage ---
FROM node:24-slim

WORKDIR /opt/relab/frontend

# Install serve for static file serving
RUN npm install -g serve

# Set up a non-root user 
RUN useradd -m appuser

# Copy the build output
COPY --from=builder --chown=appuser:appuser /opt/relab/frontend/dist /opt/relab/frontend/dist

EXPOSE 8081

USER appuser

# Serve the static build
CMD ["serve", "-s", "dist", "-l", "8081"]