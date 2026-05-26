import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Code2, LayoutDashboard, FolderGit2, Activity, User, Settings, LogOut, Plus, LogIn } from "lucide-react";
import type { ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/sessions", label: "Sessions", icon: FolderGit2 },
  { to: "/create-session", label: "Create", icon: Plus },
  { to: "/join-session", label: "Join", icon: LogIn },
  { to: "/activity-logs", label: "Activity", icon: Activity },
  { to: "/profile", label: "Profile", icon: User },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { signOut, user } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const handleLogout = async () => {
    await signOut();
    toast.success("Signed out");
    navigate({ to: "/login" });
  };

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="flex w-56 flex-col border-r border-border bg-sidebar">
        <div className="flex items-center gap-2 px-5 py-5">
          <Code2 className="h-6 w-6 text-primary" />
          <span className="font-semibold">CodeSync</span>
        </div>
        <nav className="flex-1 px-2">
          {navItems.map((item) => {
            const active = pathname === item.to || pathname.startsWith(item.to + "/");
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`mb-1 flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
                  active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border p-3">
          <div className="mb-2 truncate px-2 text-xs text-muted-foreground">{user?.email}</div>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
