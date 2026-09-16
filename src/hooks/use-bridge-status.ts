import { useQuery } from "@tanstack/react-query";
import { fetchStatus } from "../lib/api/client.js";

export function useBridgeStatus() {
  return useQuery({
    queryKey: ["bridge", "status"],
    queryFn: ({ signal }) => fetchStatus(signal),
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
  });
}
