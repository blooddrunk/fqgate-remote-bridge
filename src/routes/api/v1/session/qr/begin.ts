import { createFileRoute } from "@tanstack/react-router";
import { getBridgeHttpHandler } from "../../../../../bridge/runtime.js";

export const Route = createFileRoute("/api/v1/session/qr/begin")({
  server: {
    handlers: {
      POST: async ({ request }) => (await getBridgeHttpHandler())(request, "session.qr.begin"),
    },
  },
});
