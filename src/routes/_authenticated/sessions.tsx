import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/sessions")({ component: SessionsPage });

interface S { id: string; name: string; owner_id: string; created_at: string; }

function SessionsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<S[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data, error } = await supabase.from("sessions").select("*").order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setItems(data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this session?")) return;
    const { error } = await supabase.from("sessions").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Session deleted");
    load();
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl p-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Sessions</h1>
          <Link to="/create-session" className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            New session
          </Link>
        </div>
        <div className="mt-6 overflow-hidden rounded-lg border border-border bg-card">
          {loading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading…</div>
          ) : items.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">No sessions. Create one to get started.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Created</th><th className="px-4 py-3">Role</th><th className="px-4 py-3 text-right">Actions</th></tr>
              </thead>
              <tbody>
                {items.map((s) => (
                  <tr key={s.id} className="border-t border-border">
                    <td className="px-4 py-3 font-medium">{s.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{new Date(s.created_at).toLocaleString()}</td>
                    <td className="px-4 py-3 text-muted-foreground">{s.owner_id === user?.id ? "Owner" : "Participant"}</td>
                    <td className="px-4 py-3 text-right">
                      <Link to="/editor/$sessionId" params={{ sessionId: s.id }} className="mr-3 text-primary hover:underline">Open</Link>
                      {s.owner_id === user?.id && (
                        <button onClick={() => handleDelete(s.id)} className="inline-flex items-center text-destructive hover:underline">
                          <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AppShell>
  );
}
