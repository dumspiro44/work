import fs from "node:fs";
import path from "node:path";
import { type Server } from "node:http";

import { nanoid } from "nanoid";
import { type Express } from "express";
import { createServer as createViteServer, createLogger } from "vite";

import viteConfig from "../vite.config";
import runApp from "./app";

export async function setupVite(app: Express, server: Server) {
  const viteLogger = createLogger();
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  // Only use Vite middlewares for non-API routes
  app.use((req, res, next) => {
    console.log(`[Vite middleware] Path: ${req.path}`);
    if (req.path.startsWith("/api")) {
      console.log(`[Vite middleware] Skipping /api route, calling next()`);
      return next();
    }
    vite.middlewares(req, res, next);
  });

  // Catch-all route for client-side rendering (only for non-API routes)
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    console.log(`[HTML catch-all] URL: ${url}`);

    // Skip rendering HTML for API routes - let them be handled by Express
    if (url.startsWith("/api")) {
      console.log(`[HTML catch-all] Skipping /api route, calling next()`);
      return next();
    }
    console.log(`[HTML catch-all] Rendering HTML for: ${url}`);

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

(async () => {
  await runApp(setupVite);
})();
