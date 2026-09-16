import { createFileRoute } from "@tanstack/react-router";
import { getBridgeHttpHandler } from "../../../../../bridge/runtime.js";

export const Route = createFileRoute("/api/v1/session/qr/poll")({
  server: {
    handlers: {
      POST: async ({ request }) => (await getBridgeHttpHandler())(request, "session.qr.poll"),
    },
  },
});
