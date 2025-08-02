# Use official Node.js 18 image as base
FROM node:18

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json first
COPY package*.json ./

# Install dependencies
RUN npm install

# If using TypeScript, also install ts-node and typescript (optional)
# RUN npm install --save-dev typescript ts-node

# Install nodemon globally for dev mode
RUN npm install -g nodemon

# Copy all project files
COPY . .

# Expose the port (change if different)
EXPOSE 3000

# Run dev server
CMD ["npm", "run", "dev"]
