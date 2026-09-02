import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authApi } from "../api/auth.js";
import type { RegisterInput, LoginRequestInput, LoginVerifyInput } from "@shared/schema.js";

export function useAuth() {
  const qc = useQueryClient();

  const { data: user, isLoading } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: authApi.me,
    retry: false,
  });

  const registerMutation = useMutation({
    mutationFn: (data: RegisterInput) => authApi.register(data),
  });

  const loginRequestMutation = useMutation({
    mutationFn: (data: LoginRequestInput) => authApi.loginRequest(data),
  });

  const loginVerifyMutation = useMutation({
    mutationFn: (data: LoginVerifyInput) => authApi.loginVerify(data),
    onSuccess: (u) => qc.setQueryData(["auth", "me"], u),
  });

  const logoutMutation = useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => {
      qc.setQueryData(["auth", "me"], null);
      qc.clear();
    },
  });

  // Switching identity invalidates literally every cached query (rooms, mail,
  // wallet, ...), so drop the cache and reload from the root route rather than
  // trying to refetch piecemeal into a half-stale tree.
  const restartAsNewIdentity = () => {
    qc.clear();
    window.location.assign("/");
  };
  const impersonateMutation = useMutation({
    mutationFn: (userId: number) => authApi.impersonate(userId),
    onSuccess: restartAsNewIdentity,
  });
  const stopImpersonationMutation = useMutation({
    mutationFn: authApi.stopImpersonation,
    onSuccess: restartAsNewIdentity,
  });

  return {
    user: user ?? null,
    isLoading,
    impersonate: impersonateMutation.mutate,
    impersonateError: impersonateMutation.error,
    stopImpersonation: stopImpersonationMutation.mutate,
    register: registerMutation.mutateAsync,
    registerError: registerMutation.error,
    loginRequest: loginRequestMutation.mutateAsync,
    loginRequestError: loginRequestMutation.error,
    loginVerify: loginVerifyMutation.mutateAsync,
    loginVerifyError: loginVerifyMutation.error,
    logout: logoutMutation.mutate,
  };
}
