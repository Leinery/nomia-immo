import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Clerk proxy must be mounted before body parsers (streams raw bytes)
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.use(cors({ credentials: true, origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Clerk session middleware — resolves publishable key from host for multi-domain support
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

// Global auth guard — every /api/* route requires a valid Clerk session.
// Storage public-objects is served at /api/storage/public-objects/* and is
// intentionally excluded (static assets, no user data).
import { getAuth } from "@clerk/express";

app.use("/api", (req, res, next) => {
  // Allow public-object serving without auth
  if (req.path.startsWith("/storage/public-objects/")) return next();
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Nicht autorisiert" });
    return;
  }
  next();
});

app.use("/api", router);

export default app;
