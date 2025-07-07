import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Github } from "lucide-react";
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
    }
  }, [user, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background-alt">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (user) {
    return null; // Will redirect based on approval status
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background-alt">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-foreground">Welcome to TRE</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in to access the Trusted Research Environment
          </p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <Button
              className="w-full"
              onClick={() => window.location.href = "/api/auth/github"}
            >
              <Github className="mr-2 h-4 w-4" />
              Sign in with GitHub
            </Button>

            <div className="mt-6 text-center">
              <p className="text-xs text-muted-foreground">
                By signing in, you agree to our terms of service and privacy policy.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
