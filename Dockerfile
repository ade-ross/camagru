FROM node:22-bookworm-slim
WORKDIR /usr/app
COPY package.json .
RUN npm install --quiet
COPY . .
CMD ["node", "src/server.js"]
