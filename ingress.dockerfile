FROM node:12 AS helpers

RUN mkdir -p /project/helpers
WORKDIR /project/helpers

COPY ./helpers/package*.json ./

RUN npm i

####

FROM node:12 as service

RUN mkdir -p /project/helpers

RUN mkdir -p /project/app
WORKDIR /project/app

COPY ./ingress/package*.json ./

RUN npm i

####

FROM node:12 as dev

RUN mkdir /project

COPY --from=helpers ./project/helpers/ /project/helpers
COPY --from=service ./project/app/ /project/app

WORKDIR /project/app
