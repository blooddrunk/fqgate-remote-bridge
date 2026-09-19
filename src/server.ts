import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import type { RequestOptions } from "@tanstack/react-start/server";
import type { Register } from "@tanstack/react-router";
import { BridgeError, ERROR_CODES } from "./shared/errors.js";
import {
  authenticateRequestContext,
  isRegisteredBridgeOperation,
} from "./bridge/policy/request-context.js";
import { getBridgeRequestContextOptions } from "./bridge/runtime.js";
import { createBridgeErrorResponse, withSecurityHeaders } from "./bridge/transport/http.js";

const fetch = async (request: Request, options?: RequestOptions<Register>): Promise<Response> => {
  try {
    const authenticated = await authenticateRequestContext(
      request,
      await getBridgeRequestContextOptions(),
    );
    if (authenticated.context === "remote_machine" && !isRegisteredBridgeOperation(request)) {
      throw new BridgeError(
        ERROR_CODES.OPERATION_FORBIDDEN,
        "The machine request cannot use a page, static, or unregistered bridge route",
      );
    }
  } catch (error) {
    return withSecurityHeaders(createBridgeErrorResponse(error));
  }
  const response = await handler.fetch(request, options);
  return withSecurityHeaders(response);
};

export default createServerEntry({ fetch });
