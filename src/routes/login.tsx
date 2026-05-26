import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Code2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/login")({ component: LoginPage });

function LoginPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (session) navigate({ to: "/dashboard" }); }, [session, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Welcome back!");
    navigate({ to: "/dashboard" });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2">
          <Code2 className="h-7 w-7 text-primary" />
          <span className="text-xl font-semibold">CodeSync</span>
        </Link>
        <div className="rounded-lg border border-border bg-card p-6">
          <h1 className="text-2xl font-semibold">Sign in</h1>
          <p className="mt-1 text-sm text-muted-foreground">Welcome back to your sessions.</p>
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="text-sm">Email</label>
              <input type="email" required value={email} onChange={(e)=>setEmail(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-input px-3 py-2 outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div>
              <label className="text-sm">Password</label>
              <input type="password" required value={password} onChange={(e)=>setPassword(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-input px-3 py-2 outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <button disabled={loading} className="w-full rounded-md bg-primary py-2 font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            No account? <Link to="/register" className="text-primary hover:underline">Create one</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
