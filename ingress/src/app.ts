import express = require("express");

const app: express.Application = express();

app.get("/ping", (req, res) => res.send("pong"));

app.listen(() => console.log("Listening on port 3000", 3000));
