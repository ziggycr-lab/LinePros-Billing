import { createApp } from "./app.js";
import { getConfig } from "./config.js";

const config = getConfig();
const app = createApp();

const server = app.listen(config.port, config.host, () => {
  console.log(`[linepros] billing API listening on ${config.host}:${config.port}`);
});

export { app, server };
