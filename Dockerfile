FROM node:22-slim

WORKDIR /app
COPY package.json ./
COPY server.mjs ./
COPY public ./public

ENV PORT=8990
ENV HOST=0.0.0.0
ENV PAWS_DATA_DIR=/data

VOLUME ["/data"]
EXPOSE 8990

CMD ["node", "server.mjs"]
