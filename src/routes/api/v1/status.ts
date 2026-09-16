import { createFileRoute } from "@tanstack/react-router";
import { getBridgeHttpHandler } from "../../../bridge/runtime.js";

export const Route = createFileRoute("/api/v1/status")({
  server: {
    handlers: {
      GET: async ({ request }) => (await getBridgeHttpHandler())(request, "bridge.status"),
    },
  },
});
