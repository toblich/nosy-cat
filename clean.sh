#!/bin/bash

set -e # Exit on first error

# Clean graph
curl -X DELETE localhost:4000/graph

# Clean influxdb (use old & future date to delete everything)
docker-compose exec influxdb influx delete \
  -o nosy-cat \
  --bucket default \
  --start '1970-01-01T00:00:00Z' \
  --stop '2222-01-01T00:00:00Z'

# Clean redis
docker-compose exec redis redis-cli flushall
