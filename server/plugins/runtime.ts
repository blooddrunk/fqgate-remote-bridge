import { definePlugin } from "nitro";
import { isClientAbortError } from "../../src/server/client-abort.js";

export default definePlugin((nitroApp) => {
  // H3 logs an unhandled error before Nitro's error handler receives it. The
  // bridge owns safe structured logging, so disable raw H3 stack output and
  // keep only bounded request metadata below.
  if (nitroApp.h3 !== undefined) nitroApp.h3.config.silent = true;

  nitroApp.hooks.hook("error", (error, context) => {
    if (isClientAbortError(error)) return;

    const request = context.event?.req;
    const path = request === undefined ? undefined : safePath(request.url);
    const entry = {
      timestamp: new Date().toISOString(),
      level: "error",
      message: "Unhandled production request error",
      context: {
        ...(request?.method === undefined ? {} : { method: request.method }),
        ...(path === undefined ? {} : { path }),
        ...(context.tags === undefined ? {} : { tags: context.tags }),
      },
    };
    console.error(JSON.stringify(entry));
  });
});

function safePath(url: string): string | undefined {
  try {
    return new URL(url).pathname;
  } catch {
    return undefined;
  }
}
