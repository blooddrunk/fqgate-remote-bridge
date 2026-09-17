import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchOpenApiCatalog, refreshOpenApiCatalog } from "../lib/api/client.js";

const OPENAPI_CATALOG_KEY = ["bridge", "openapi-catalog"] as const;

export function useApiReference() {
  const queryClient = useQueryClient();
  const catalog = useQuery({
    queryKey: OPENAPI_CATALOG_KEY,
    queryFn: ({ signal }) => fetchOpenApiCatalog(signal),
    staleTime: 5_000,
    refetchOnWindowFocus: false,
    refetchInterval: false,
  });
  const refresh = useMutation({
    mutationFn: refreshOpenApiCatalog,
    onSuccess: (value) => queryClient.setQueryData(OPENAPI_CATALOG_KEY, value),
  });
  return { catalog, refresh };
}
