import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/profile")({ component: ProfilePage });

interface Profile { id: string; username: string; email: string; created_at: string; }

function ProfilePage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle();
      if (data) { setProfile(data); setUsername(data.username); }
    })();
  }, [user]);

  const save = async () => {
    setBusy(true);
    const { error } = await supabase.from("profiles").update({ username }).eq("id", user!.id);
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success("Profile updated");
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-xl p-8">
        <h1 className="text-2xl font-semibold">Profile</h1>
        <div className="mt-6 space-y-4 rounded-lg border border-border bg-card p-6">
          <div>
            <label className="text-xs uppercase text-muted-foreground">Email</label>
            <div className="mt-1 text-sm">{profile?.email}</div>
          </div>
          <div>
            <label className="text-xs uppercase text-muted-foreground">Username</label>
            <input value={username} onChange={(e)=>setUsername(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-input px-3 py-2 outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <div>
            <label className="text-xs uppercase text-muted-foreground">Member since</label>
            <div className="mt-1 text-sm">{profile && new Date(profile.created_at).toLocaleDateString()}</div>
          </div>
          <button onClick={save} disabled={busy} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {busy ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>
    </AppShell>
  );
}
