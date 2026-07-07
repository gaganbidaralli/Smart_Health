# Use the official Node.js 20 lightweight Alpine image
FROM node:20-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy package files for installing dependencies
COPY package*.json ./

# Install only production dependencies (ignoring devDependencies like Vite/ESLint)
RUN npm install --omit=dev

# Copy the server configuration and prebuilt client assets
COPY server.js ./
COPY standalone_dashboard.html ./
COPY dist/ ./dist/
COPY functions/ ./functions/
COPY src/data/ ./src/data/

# Expose the standard Cloud Run port
EXPOSE 8080

# Define environment variables
ENV NODE_ENV=production
ENV PORT=8080

# Start the application server
CMD ["npm", "start"]
