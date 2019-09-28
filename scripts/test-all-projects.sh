#!/bin/bash

# Enable bash 'strict mode' (http://redsymbol.net/articles/unofficial-bash-strict-mode/)
set -euo pipefail
IFS=$'\n\t'

DIR="$(cd -P "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd helpers && npm run build && cd ..

$DIR/commands/for-all-projects-do npm test
