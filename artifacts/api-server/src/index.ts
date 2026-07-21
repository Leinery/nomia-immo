import app from "./app";
import { logger } from "./lib/logger";
import { initAllFolders } from "./lib/onedrive";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // ── OneDrive: ensure folder tree exists (runs async, non-blocking) ──────────
  initAllFolders()
    .then(({ created, errors }) => {
      if (created.length > 0) logger.info({ count: created.length }, "OneDrive folders ensured");
      if (errors.length > 0)  logger.warn({ errors }, "OneDrive folder setup had errors");
    })
    .catch(err => logger.warn({ err }, "OneDrive folder setup skipped (not configured)"));
});
