import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/join-session")({ component: JoinSessionPage });

function JoinSessionPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [sessionId, setSessionId] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = sessionId.trim();
    if (!id) return;
    setBusy(true);
    const { data: s, error } = await supabase.from("sessions").select("id, name").eq("id", id).maybeSingle();
    if (error || !s) { setBusy(false); toast.error("Session not found"); return; }
    await supabase.from("participants").upsert({ session_id: s.id, user_id: user!.id }, { onConflict: "session_id,user_id" });
    await supabase.from("activity_logs").insert({ user_id: user!.id, session_id: s.id, activity: `Joined session "${s.name}"` });
    toast.success("Joined!");
    navigate({ to: "/editor/$sessionId", params: { sessionId: s.id } });
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-md p-8">
        <h1 className="text-2xl font-semibold">Join session</h1>
        <p className="mt-1 text-sm text-muted-foreground">Paste a session ID shared with you.</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label className="text-sm">Session ID</label>
            <input value={sessionId} onChange={(e)=>setSessionId(e.target.value)} required
              className="mt-1 w-full rounded-md border border-border bg-input px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-ring"
              placeholder="00000000-0000-0000-0000-000000000000" />
          </div>
          <button disabled={busy} className="w-full rounded-md bg-primary py-2 font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {busy ? "Joining..." : "Join"}
          </button>
        </form>
      </div>
    </AppShell>
  );
}
