import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import type { RequestOptions } from "@tanstack/react-start/server";
import type { Register } from "@tanstack/react-router";
import { withSecurityHeaders } from "./bridge/transport/http.js";

const fetch = async (request: Request, options?: RequestOptions<Register>): Promise<Response> => {
  const response = await handler.fetch(request, options);
  return withSecurityHeaders(response);
};

export default createServerEntry({ fetch });
