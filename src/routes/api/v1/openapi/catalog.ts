import { createFileRoute } from "@tanstack/react-router";
import { getBridgeHttpHandler } from "../../../../bridge/runtime.js";

export const Route = createFileRoute("/api/v1/openapi/catalog")({
  server: {
    handlers: {
      GET: async ({ request }) => (await getBridgeHttpHandler())(request, "openapi.catalog"),
    },
  },
});
