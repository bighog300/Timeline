import { createApp } from "./app";
import { logEvent } from "./logger";

const { app } = createApp();

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => {
  logEvent("api_started", { port });
});
