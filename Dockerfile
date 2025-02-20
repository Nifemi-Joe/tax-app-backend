# Use an official Node.js image as the base image
FROM node:16-slim

# Install dependencies for Chromium and Puppeteer
RUN apt-get update && apt-get install -y \
    chromium \
    libnss3 \
    libgdk-pixbuf2.0-0 \
    libxss1 \
    libgconf-2-4 \
    libfontconfig1 \
    libxtst6 \
    libxrender1 \
    xdg-utils \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Set environment variable for Puppeteer to use the installed Chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Create and set the working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies (including Puppeteer)
RUN npm install

# Copy the rest of the application
COPY . .

# Expose the port your app will run on (for example, 3000)
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
