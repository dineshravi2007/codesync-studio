import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, LogIn, FolderGit2, Activity } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/dashboard")({ component: Dashboard });

interface SessionRow { id: string; name: string; created_at: string; owner_id: string; }
interface LogRow { id: string; activity: string; created_at: string; }

function Dashboard() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: s }, { data: l }] = await Promise.all([
        supabase.from("sessions").select("*").order("created_at", { ascending: false }).limit(20),
        supabase.from("activity_logs").select("*").eq("user_id", user!.id).order("created_at", { ascending: false }).limit(10),
      ]);
      setSessions(s ?? []);
      setLogs(l ?? []);
      setLoading(false);
    })();
  }, [user]);

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl p-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Dashboard</h1>
            <p className="text-sm text-muted-foreground">Your collaborative coding workspace.</p>
          </div>
          <div className="flex gap-2">
            <Link to="/create-session" className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              <Plus className="h-4 w-4" /> Create session
            </Link>
            <Link to="/join-session" className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent">
              <LogIn className="h-4 w-4" /> Join session
            </Link>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <Stat label="Total Sessions" value={loading ? "—" : String(sessions.length)} icon={<FolderGit2 className="h-5 w-5 text-primary" />} />
          <Stat label="Recent Activity" value={loading ? "—" : String(logs.length)} icon={<Activity className="h-5 w-5 text-primary" />} />
          <Stat label="Account" value={user?.email ?? ""} icon={<FolderGit2 className="h-5 w-5 text-primary" />} />
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <section className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Recent Sessions</h2>
              <Link to="/sessions" className="text-xs text-primary hover:underline">View all</Link>
            </div>
            <ul className="mt-3 divide-y divide-border">
              {sessions.slice(0,6).map((s) => (
                <li key={s.id} className="flex items-center justify-between py-2">
                  <div>
                    <div className="text-sm font-medium">{s.name}</div>
                    <div className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleString()}</div>
                  </div>
                  <Link to="/editor/$sessionId" params={{ sessionId: s.id }} className="text-xs text-primary hover:underline">Open</Link>
                </li>
              ))}
              {!loading && sessions.length === 0 && <li className="py-3 text-sm text-muted-foreground">No sessions yet.</li>}
            </ul>
          </section>

          <section className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Recent Activity</h2>
              <Link to="/activity-logs" className="text-xs text-primary hover:underline">View all</Link>
            </div>
            <ul className="mt-3 divide-y divide-border">
              {logs.slice(0,6).map((l) => (
                <li key={l.id} className="py-2 text-sm">
                  <div>{l.activity}</div>
                  <div className="text-xs text-muted-foreground">{new Date(l.created_at).toLocaleString()}</div>
                </li>
              ))}
              {!loading && logs.length === 0 && <li className="py-3 text-sm text-muted-foreground">No activity yet.</li>}
            </ul>
          </section>
        </div>
      </div>
    </AppShell>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
        {icon}
      </div>
      <div className="mt-2 truncate text-xl font-semibold">{value}</div>
    </div>
  );
}
