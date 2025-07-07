import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Link, useLocation } from "wouter";
import { LogOut, Github } from "lucide-react";

export function Header() {
  const { user, logout, isLoggingOut } = useAuth();
  const [location] = useLocation();

  if (!user) return null;

  const isStaff = user.role === "staff";
  const navItems = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/workspaces", label: "Workspaces" },  
    { href: "/jobs", label: "Job Requests" },
  ];

  if (isStaff) {
    navItems.push({ href: "/staff", label: "Staff Dashboard" });
  }

  return (
    <header className="bg-surface shadow-sm border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-4">
            <h1 className="text-2xl font-bold text-foreground">TRE</h1>
            <span className="text-sm text-muted-foreground">
              Trusted Research Environment
            </span>
          </div>

          <nav className="hidden md:flex space-x-8">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`font-medium transition-colors ${
                  location === item.href || (item.href !== "/dashboard" && location.startsWith(item.href))
                    ? "text-primary"
                    : "text-foreground hover:text-primary"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Avatar className="w-8 h-8">
                <AvatarImage src={user.avatarUrl || ""} alt={user.fullName || user.username} />
                <AvatarFallback>
                  <Github className="w-4 h-4" />
                </AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium text-foreground">
                {user.fullName || user.username}
              </span>
              <Badge variant={isStaff ? "default" : "secondary"}>
                {isStaff ? "Staff" : "User"}
              </Badge>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => logout()}
              disabled={isLoggingOut}
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
