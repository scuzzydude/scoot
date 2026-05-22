import { Redirect } from "wouter";
import { useAuth } from "../hooks/use-auth.js";

interface Props {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: Props) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div className="flex h-screen items-center justify-center bg-black text-white/70">Loading…</div>;
  }

  if (!user) {
    return <Redirect to="/auth" />;
  }

  return <>{children}</>;
}
