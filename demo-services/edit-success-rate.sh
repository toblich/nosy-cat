#!/bin/bash
VALUE=${1:-9}
echo "Setting requests success rate to ${VALUE}0%"
sed -E -i "s/(__jexl3\(\\$\{myrand\} .*) [1-9]/\1 $VALUE/g" ./jmeter-plan.jmx
docker-compose restart jmeter
