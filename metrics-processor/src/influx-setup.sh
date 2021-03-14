#!/bin/bash

set -e

echo "Starting setup script as ${whoami} user"

BUCKET_ID=`influx bucket list -n $DOCKER_INFLUXDB_INIT_BUCKET --hide-headers | cut -f 1`

echo "created bucket" >> $STARTUP_SCRIPT_LOGFILE

TOKEN=`influx auth create -o $DOCKER_INFLUXDB_INIT_ORG -d 'nosy-cat/metrics-processor' --write-bucket $BUCKET_ID --hide-headers | cut -f 3`

echo "created token" >> $STARTUP_SCRIPT_LOGFILE

echo "{\"influx\": \"$TOKEN\"}" > $INFLUX_TOKEN_FILEPATH

echo "wrote token" >> $STARTUP_SCRIPT_LOGFILE

echo 'Done!' >> $STARTUP_SCRIPT_LOGFILE

echo "Successfully ran setup script"
