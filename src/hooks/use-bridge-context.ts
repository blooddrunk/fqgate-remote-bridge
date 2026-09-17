import { useQuery } from "@tanstack/react-query";
import { fetchCapabilities } from "../lib/api/client.js";

export function useBridgeContext() {
  return useQuery({
    queryKey: ["bridge", "capabilities"],
    queryFn: ({ signal }) => fetchCapabilities(signal),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    refetchInterval: false,
  });
}
