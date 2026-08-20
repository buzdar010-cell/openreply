FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
RUN npm install

COPY . .
RUN npx prisma generate
RUN npm run build

ENV PORT=3000
EXPOSE 3000

CMD ["npm", "run", "docker-start"]
