# nosy-cat

Final college project: Anomaly &amp; root-cause detection on distributed systems

## Running locally

This project uses [docker-compose](https://docs.docker.com/compose/) for development. To run this locally,
simply run `docker-compose up` in the root folder.

:warning: If you want to use the Neo4J Browser, you must take into account [this necessary configuration](https://github.com/toblich/nosy-cat/blob/a52f97cd80dc5066af1dea74825cd9ad226ce00a/docker-compose.yml#L123-L127) :warning:

## Conventions

### Branching

All branches will be prefixed with `feat/`, `chore/`, `test/`, `fix/` or similar
