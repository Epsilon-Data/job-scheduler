import { useAuth } from "@/hooks/use-auth";
import { useLocation, useSearch } from "wouter";
import { useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface SignInError {
  title: string;
  message: string;
}

const SIGN_IN_FAILED: SignInError = { title: "Sign-in failed", message: "Sign-in could not be completed. Sign in again." };
const TOKEN_REFUSED: SignInError = { title: "Sign-in failed", message: "Your sign-in could not be verified. Sign in again." };

// Errors the Keycloak callback (/api/auth/callback) sends back as /auth?error=<code>; any other code
// (passed on from Keycloak) gets SIGN_IN_FAILED
const SIGN_IN_ERRORS = new Map<string, SignInError>([
  ["account_conflict", {
    title: "Account conflict",
    message: "This email address is already linked to another account. Ask the Epsilon administrator.",
  }],
  ["email_not_verified", {
    title: "Email not verified",
    message: "Verify your email address with the link Epsilon sent you by email, then sign in again.",
  }],
  ["rejected", {
    title: "Access denied",
    message: "Your account does not have access. Ask the Epsilon administrator.",
  }],
  ["state_mismatch", {
    title: "Sign-in expired",
    message: "The sign-in took too long or was started in another tab. Sign in again.",
  }],
  ["invalid_token", TOKEN_REFUSED],
  ["token_decode_failed", TOKEN_REFUSED],
  ["token_exchange_failed", SIGN_IN_FAILED],
  ["no_code", SIGN_IN_FAILED],
  ["server_configuration", {
    title: "Sign-in unavailable",
    message: "Sign-in is not set up on this server. Ask the Epsilon administrator.",
  }],
  ["access_denied", { title: "Sign-in cancelled", message: "Sign-in was cancelled. Sign in again to continue." }],
]);

export default function Auth() {
  const { user, isLoading, logout, isLoggingOut } = useAuth();
  const [, setLocation] = useLocation();
  const error = new URLSearchParams(useSearch()).get("error");

  useEffect(() => {
    if (user) {
      if (user.approvalStatus === "pending") {
        setLocation("/approval-request");
      } else if (user.approvalStatus === "approved") {
        setLocation(user.role === "reviewer" ? "/review" : "/dashboard");
      }
    } else if (!isLoading && !error) {
      // Auto-redirect to Keycloak for SSO (not after a failed sign-in, which would only fail again)
      window.location.href = "/api/auth/login";
    }
  }, [user, isLoading, error, setLocation]);

  // A rejected account keeps its session, so it is told here with or without ?error=rejected
  const failure = user?.approvalStatus === "rejected" ? "rejected" : !user && !isLoading ? error : null;
  if (failure) {
    const { title, message } = SIGN_IN_ERRORS.get(failure) ?? SIGN_IN_FAILED;

    return (
      <div className="min-h-screen flex items-center justify-center bg-background-alt">
        <Card className="w-full max-w-md mx-4">
          <CardContent className="pt-6 text-center">
            <h2 className="text-2xl font-bold text-foreground mb-4">{title}</h2>
            <p className="text-muted-foreground">{message}</p>
            <div className="mt-6 flex justify-center gap-3">
              {!user && (
                <Button asChild>
                  <a href="/api/auth/login">Sign in again</a>
                </Button>
              )}
              {/* Ends the Keycloak session too, so another account can sign in */}
              <Button variant="outline" onClick={() => logout()} disabled={isLoggingOut}>
                Sign out
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

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
