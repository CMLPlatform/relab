FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Run the expo server
# TODO: For prod, it is better to export the app and serve the static files. 
# However, the expo .env variables are not loaded in the build phase.
# For now, we will run the expo server in development mode.
CMD ["npx", "expo", "start", "--port", "3000", "--web"]
