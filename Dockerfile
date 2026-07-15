FROM node:20-alpine

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# Copy the rest of the application code
COPY . .

# Build the client-side assets for production
RUN npm run build

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000

# Expose the unified port (Vite static files + WebSocket)
EXPOSE 3000

# Start the unified server using the start script
CMD ["npm", "start"]
