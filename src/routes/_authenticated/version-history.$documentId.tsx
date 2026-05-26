import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/version-history/$documentId")({ component: VersionHistoryPage });

interface Version { id: string; version_number: number; content: string; created_at: string; }
interface Doc { id: string; name: string; session_id: string; content: string; }

function VersionHistoryPage() {
  const { documentId } = Route.useParams();
  const navigate = useNavigate();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [selected, setSelected] = useState<Version | null>(null);

  const load = async () => {
    const [{ data: d }, { data: vs }] = await Promise.all([
      supabase.from("documents").select("id, name, session_id, content").eq("id", documentId).maybeSingle(),
      supabase.from("versions").select("*").eq("document_id", documentId).order("version_number", { ascending: false }),
    ]);
    setDoc(d as Doc | null);
    setVersions((vs ?? []) as Version[]);
    if (vs && vs.length) setSelected(vs[0] as Version);
  };

  useEffect(() => { load(); }, [documentId]);

  const restore = async (v: Version) => {
    if (!doc) return;
    if (!confirm(`Restore version ${v.version_number}? Current content will be saved as a new version first.`)) return;
    // Snapshot current
    const next = (versions[0]?.version_number ?? 0) + 1;
    await supabase.from("versions").insert({ document_id: doc.id, version_number: next, content: doc.content });
    const { error } = await supabase.from("documents").update({ content: v.content, updated_at: new Date().toISOString() }).eq("id", doc.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Restored v${v.version_number}`);
    navigate({ to: "/editor/$sessionId", params: { sessionId: doc.session_id } });
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl p-6">
        <button onClick={() => doc && navigate({ to: "/editor/$sessionId", params: { sessionId: doc.session_id } })}
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to editor
        </button>
        <h1 className="text-2xl font-semibold">Version History {doc && <span className="text-muted-foreground">— {doc.name}</span>}</h1>
        <div className="mt-6 grid gap-4 lg:grid-cols-[300px_1fr]">
          <aside className="overflow-hidden rounded-lg border border-border bg-card">
            {versions.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">No versions yet. Save the document to create one.</div>
            ) : (
              <ul className="max-h-[70vh] overflow-auto divide-y divide-border">
                {versions.map((v) => (
                  <li key={v.id}>
                    <button onClick={() => setSelected(v)}
                      className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-accent ${selected?.id === v.id ? "bg-accent" : ""}`}>
                      <div>
                        <div className="font-medium">v{v.version_number}</div>
                        <div className="text-xs text-muted-foreground">{new Date(v.created_at).toLocaleString()}</div>
                      </div>
                      <span onClick={(e)=>{e.stopPropagation(); restore(v);}} className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground hover:bg-primary/90">
                        Restore
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>
          <section className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="border-b border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
              {selected ? `Preview v${selected.version_number}` : "Select a version"}
            </div>
            <pre className="mono max-h-[70vh] overflow-auto p-4 text-xs leading-relaxed">
              {selected?.content ?? ""}
            </pre>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
