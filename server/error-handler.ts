import { defineErrorHandler } from "nitro";
import { isClientAbortError } from "../src/server/client-abort.js";

export default defineErrorHandler((error) => {
  if (!isClientAbortError(error)) return;
  return new Response(null, { status: 499, statusText: "Client Closed Request" });
});
