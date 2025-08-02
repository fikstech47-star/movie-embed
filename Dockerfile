# Use official Node.js 18 image as base
FROM node:18

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json first for caching
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy all source files
COPY . .

# Expose the port your app listens on
EXPOSE 3000

# Default command to run your app
CMD ["npm", "start"]
