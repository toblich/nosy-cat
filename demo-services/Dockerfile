FROM node:12

RUN mkdir -p /project/app
WORKDIR /project/app

COPY package*.json ./
RUN npm ci

CMD ["npm", "run", "start"]