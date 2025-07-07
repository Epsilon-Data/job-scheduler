import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Header } from "@/components/header";
import { useAuth } from "@/hooks/use-auth";
import Auth from "@/pages/auth";
import ApprovalRequest from "@/pages/approval-request";
import StaffDashboard from "@/pages/staff-dashboard";
import UserDashboard from "@/pages/user-dashboard";
import CreateWorkspace from "@/pages/create-workspace";
import WorkspaceDetail from "@/pages/workspace-detail";
import CreateJobRequest from "@/pages/create-job-request";
import JobRequestDetail from "@/pages/job-request-detail";
import NotFound from "@/pages/not-found";

function AppContent() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <Switch>
        <Route path="/" component={user ? UserDashboard : Auth} />
        <Route path="/auth" component={Auth} />
        <Route path="/approval-request" component={ApprovalRequest} />
        <Route path="/dashboard" component={UserDashboard} />
        <Route path="/workspaces" component={UserDashboard} />
        <Route path="/workspaces/new" component={CreateWorkspace} />
        <Route path="/workspaces/:id" component={WorkspaceDetail} />
        <Route path="/workspaces/:workspaceId/jobs/new" component={CreateJobRequest} />
        <Route path="/jobs/:id" component={JobRequestDetail} />
        <Route path="/staff" component={StaffDashboard} />
        <Route path="/requests" component={UserDashboard} />
        <Route component={NotFound} />
      </Switch>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <AppContent />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
