FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential python3 pkg-config libgd-dev \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/app
COPY package.json .
RUN npm install --quiet
COPY . .
CMD ["node", "src/server.js"]