FROM node:22.16.0-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
COPY server.js ./server.js
COPY public ./public
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app
EXPOSE 8081
CMD ["node","server.js"]
