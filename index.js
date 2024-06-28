const express = require("express");
const bodyParser = require("body-parser");
const app = express();
const connectDB = require("./core/db");
require("dotenv").config();

const router = require("./router/router");
const { configLoader } = require("./core/loadConfig");
const { parseBoolean } = require("./utils/utils");
const logger = require("./utils/logger").init();

const USE_DB = parseBoolean(process.env.USE_DB);
const PORT = process.env.PORT;
app.use(bodyParser.json({ limit: "10mb" }));
app.use(express.json());

configLoader
  .init()
  .then((data) => {
    logger.info("Config loaded successfully.");

    if (USE_DB) {
      connectDB();
    }
    app.use(router);

    app.listen(PORT, () => {
      logger.info("server listening at port " + PORT);
    });
  })
  .catch((e) => {
    logger.error("Error loading config file:", e);
  });
