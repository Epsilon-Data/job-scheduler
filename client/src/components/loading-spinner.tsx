interface LoadingSpinnerProps {
  message?: string;
  fullScreen?: boolean;
}

export function LoadingSpinner({
  message = "Loading...",
  fullScreen = true
}: LoadingSpinnerProps) {
  const containerClass = fullScreen
    ? "min-h-screen flex items-center justify-center"
    : "flex items-center justify-center py-8";

  return (
    <div className={containerClass}>
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
        <p className="text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}
