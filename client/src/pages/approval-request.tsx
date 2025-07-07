import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Clock } from "lucide-react";
import { useLocation } from "wouter";
import { approvalRequestSchema, type ApprovalRequest } from "@shared/schema";

export default function ApprovalRequest() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<ApprovalRequest>({
    resolver: zodResolver(approvalRequestSchema),
    defaultValues: {
      researchPurpose: user?.researchPurpose || "",
      institution: user?.institution || "",
      expectedDuration: user?.expectedDuration || "",
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (data: ApprovalRequest) => {
      const response = await apiRequest("POST", "/api/approval-request", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Request submitted",
        description: "Your approval request has been submitted successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setLocation("/dashboard");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Redirect if already approved
  if (user?.approvalStatus === "approved") {
    setLocation("/dashboard");
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background-alt">
      <div className="max-w-2xl w-full mx-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-warning rounded-full flex items-center justify-center mx-auto mb-4">
                <Clock className="h-8 w-8 text-warning-foreground" />
              </div>
              <h2 className="text-2xl font-bold text-foreground">Request Access</h2>
              <p className="mt-2 text-muted-foreground">
                Please provide additional information to access the research environment
              </p>
            </div>

            <form onSubmit={handleSubmit((data) => submitMutation.mutate(data))} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="researchPurpose">Research Purpose</Label>
                <Textarea
                  id="researchPurpose"
                  {...register("researchPurpose")}
                  placeholder="Describe your research purpose and objectives..."
                  rows={4}
                />
                {errors.researchPurpose && (
                  <p className="text-sm text-error">{errors.researchPurpose.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="institution">Institution/Organization</Label>
                <Input
                  id="institution"
                  {...register("institution")}
                  placeholder="Enter your institution name"
                />
                {errors.institution && (
                  <p className="text-sm text-error">{errors.institution.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="expectedDuration">Expected Duration</Label>
                <Select onValueChange={(value) => setValue("expectedDuration", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select duration" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1-3 months">1-3 months</SelectItem>
                    <SelectItem value="3-6 months">3-6 months</SelectItem>
                    <SelectItem value="6-12 months">6-12 months</SelectItem>
                    <SelectItem value="1+ years">1+ years</SelectItem>
                  </SelectContent>
                </Select>
                {errors.expectedDuration && (
                  <p className="text-sm text-error">{errors.expectedDuration.message}</p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={submitMutation.isPending}
              >
                {submitMutation.isPending ? "Submitting..." : "Submit Request"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
