import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  applyUpdate,
  checkForUpdate,
  fetchUpdateStatus,
  planInstallOrUpdate,
  prepareUpdateApply,
} from "../lib/api/client.js";

const UPDATE_STATUS_KEY = ["bridge", "updates"] as const;

export function useUpdateCenter() {
  const queryClient = useQueryClient();
  const status = useQuery({
    queryKey: UPDATE_STATUS_KEY,
    queryFn: ({ signal }) => fetchUpdateStatus(signal),
    staleTime: 2_000,
    refetchOnWindowFocus: false,
    refetchInterval: false,
  });
  const check = useMutation({
    mutationFn: checkForUpdate,
    onSuccess: (value) => queryClient.setQueryData(UPDATE_STATUS_KEY, value),
  });
  const preview = useMutation({
    mutationFn: planInstallOrUpdate,
    onSuccess: (value) => queryClient.setQueryData(UPDATE_STATUS_KEY, value),
  });
  const apply = useMutation({
    mutationFn: ({ planId, confirmationGrant }: { planId: string; confirmationGrant?: string }) =>
      applyUpdate(planId, confirmationGrant),
    onSuccess: (value) => queryClient.setQueryData(UPDATE_STATUS_KEY, value),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: UPDATE_STATUS_KEY }),
  });
  const prepareApply = useMutation({ mutationFn: prepareUpdateApply });
  return { status, check, preview, prepareApply, apply };
}
