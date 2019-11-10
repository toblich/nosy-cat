FROM node:12 AS helpers

RUN mkdir -p /project/helpers
WORKDIR /project/helpers

COPY ./helpers/package*.json ./

RUN npm i

####

FROM node:12 as service

ARG INSTALL_PULSAR="false"
COPY ./pulsar-assets ./pulsar-assets
RUN if [ "${INSTALL_PULSAR}" = "true" ]; then \
   apt install ./pulsar-assets/*; \
  fi

RUN mkdir -p /project/app
WORKDIR /project/app

ARG SERVICE
COPY ./${SERVICE}/package*.json ./

RUN npm i

RUN mkdir -p /project/helpers
COPY --from=helpers ./project/helpers/ /project/helpers

WORKDIR /project/app

COPY ./wait-for-it.sh .

RUN chmod +x wait-for-it.sh
