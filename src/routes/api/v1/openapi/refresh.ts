import { createFileRoute } from "@tanstack/react-router";
import { getBridgeHttpHandler } from "../../../../bridge/runtime.js";

export const Route = createFileRoute("/api/v1/openapi/refresh")({
  server: {
    handlers: {
      POST: async ({ request }) => (await getBridgeHttpHandler())(request, "openapi.refresh"),
    },
  },
});
