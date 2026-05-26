import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Code2, GitBranch, Users, Zap } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/")({ component: Index });

function Index() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!loading && session) navigate({ to: "/dashboard" });
  }, [loading, session, navigate]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <Code2 className="h-6 w-6 text-primary" />
            <span className="text-lg font-semibold">CodeSync</span>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground">Log in</Link>
            <Link to="/register" className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              Get started
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-20">
        <section className="text-center">
          <h1 className="mx-auto max-w-3xl text-5xl font-bold leading-tight tracking-tight">
            Code together. In real time. <span className="text-primary">Without the conflicts.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            A collaborative code editor with thread-synchronized conflict detection,
            automatic version snapshots, and Monaco-powered editing.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link to="/register" className="rounded-md bg-primary px-5 py-2.5 font-medium text-primary-foreground hover:bg-primary/90">
              Create an account
            </Link>
            <Link to="/login" className="rounded-md border border-border px-5 py-2.5 font-medium hover:bg-accent">
              Sign in
            </Link>
          </div>
        </section>
        <section className="mt-24 grid gap-6 md:grid-cols-3">
          {[
            { icon: Zap, title: "Real-time sync", text: "Edits broadcast instantly across all session participants." },
            { icon: Users, title: "Live presence", text: "See who's online, their cursors and active files." },
            { icon: GitBranch, title: "Version control", text: "Automatic snapshots, rollback, and diff comparison." },
          ].map((f) => (
            <div key={f.title} className="rounded-lg border border-border bg-card p-6">
              <f.icon className="h-6 w-6 text-primary" />
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
