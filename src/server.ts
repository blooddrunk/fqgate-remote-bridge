import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import type { RequestOptions } from "@tanstack/react-start/server";
import type { Register } from "@tanstack/react-router";
import { authenticateRequestContext } from "./bridge/policy/request-context.js";
import { getBridgeRequestContextOptions } from "./bridge/runtime.js";
import { createBridgeErrorResponse, withSecurityHeaders } from "./bridge/transport/http.js";

const fetch = async (request: Request, options?: RequestOptions<Register>): Promise<Response> => {
  try {
    await authenticateRequestContext(request, await getBridgeRequestContextOptions());
  } catch (error) {
    return withSecurityHeaders(createBridgeErrorResponse(error));
  }
  const response = await handler.fetch(request, options);
  return withSecurityHeaders(response);
};

export default createServerEntry({ fetch });
