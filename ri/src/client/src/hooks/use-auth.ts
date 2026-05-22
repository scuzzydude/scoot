import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authApi } from "../api/auth.js";
import type { RegisterInput, LoginInput } from "@shared/schema.js";

export function useAuth() {
  const qc = useQueryClient();

  const { data: user, isLoading } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: authApi.me,
    retry: false,
  });

  const registerMutation = useMutation({
    mutationFn: (data: RegisterInput) => authApi.register(data),
    onSuccess: (u) => qc.setQueryData(["auth", "me"], u),
  });

  const loginMutation = useMutation({
    mutationFn: (data: LoginInput) => authApi.login(data),
    onSuccess: (u) => qc.setQueryData(["auth", "me"], u),
  });

  const logoutMutation = useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => {
      qc.setQueryData(["auth", "me"], null);
      qc.clear();
    },
  });

  return {
    user: user ?? null,
    isLoading,
    register: registerMutation.mutateAsync,
    login: loginMutation.mutateAsync,
    logout: logoutMutation.mutate,
    registerError: registerMutation.error,
    loginError: loginMutation.error,
  };
}
