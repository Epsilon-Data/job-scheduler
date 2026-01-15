import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useEffect } from "react";

export default function Auth() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (user) {
      if (user.approvalStatus === "pending") {
        setLocation("/approval-request");
      } else if (user.approvalStatus === "approved") {
        setLocation("/dashboard");
      }
    } else if (!isLoading) {
      // Auto-redirect to Keycloak for SSO
      window.location.href = "/api/auth/login";
    }
  }, [user, isLoading, setLocation]);

  // Always show loading while checking auth or redirecting
  return (
    <div className="min-h-screen flex items-center justify-center bg-background-alt">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-muted-foreground">Redirecting to sign in...</p>
      </div>
    </div>
  );
}
