FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
# TODO: Optimize this dockerfile by using a multi-stage build
# TODO: Mount source code for development
COPY . .
# Default to development server. This can be overridden for production builds.
CMD ["npx", "expo", "start", "--port", "3000", "--web"]
