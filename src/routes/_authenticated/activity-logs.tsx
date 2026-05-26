import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/activity-logs")({ component: ActivityLogsPage });

interface Log { id: string; activity: string; created_at: string; session_id: string | null; }

function ActivityLogsPage() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("activity_logs").select("*").eq("user_id", user!.id).order("created_at", { ascending: false }).limit(200);
      setLogs(data ?? []);
      setLoading(false);
    })();
  }, [user]);

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl p-8">
        <h1 className="text-2xl font-semibold">Activity Logs</h1>
        <div className="mt-6 overflow-hidden rounded-lg border border-border bg-card">
          {loading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading…</div>
          ) : logs.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">No activity yet.</div>
          ) : (
            <ul className="divide-y divide-border">
              {logs.map((l) => (
                <li key={l.id} className="px-4 py-3 text-sm">
                  <div>{l.activity}</div>
                  <div className="text-xs text-muted-foreground">{new Date(l.created_at).toLocaleString()}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AppShell>
  );
}
