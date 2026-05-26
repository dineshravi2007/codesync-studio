import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/create-session")({ component: CreateSessionPage });

function CreateSessionPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    const { data: s, error } = await supabase
      .from("sessions")
      .insert({ name: name.trim(), owner_id: user!.id })
      .select()
      .single();
    if (error || !s) { setBusy(false); toast.error(error?.message ?? "Failed"); return; }
    await supabase.from("participants").insert({ session_id: s.id, user_id: user!.id });
    await supabase.from("documents").insert({ session_id: s.id, name: "main.js", content: "// Welcome to your new session!\n", language: "javascript" });
    await supabase.from("activity_logs").insert({ user_id: user!.id, session_id: s.id, activity: `Created session "${s.name}"` });
    toast.success("Session created");
    navigate({ to: "/editor/$sessionId", params: { sessionId: s.id } });
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-md p-8">
        <h1 className="text-2xl font-semibold">Create session</h1>
        <p className="mt-1 text-sm text-muted-foreground">Start a new collaborative coding workspace.</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label className="text-sm">Session name</label>
            <input value={name} onChange={(e)=>setName(e.target.value)} required
              className="mt-1 w-full rounded-md border border-border bg-input px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
              placeholder="e.g. Algorithms study group" />
          </div>
          <button disabled={busy} className="w-full rounded-md bg-primary py-2 font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {busy ? "Creating..." : "Create"}
          </button>
        </form>
      </div>
    </AppShell>
  );
}
