import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import { Save, GitBranch, LogOut, Users, Plus, Trash2, Edit2, FileCode2, Bell, X, AlertTriangle, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/editor/$sessionId")({ component: EditorPage });

interface SessionRow { id: string; name: string; owner_id: string; }
interface DocRow { id: string; session_id: string; name: string; content: string; language: string; updated_at: string; }
interface Presence { user_id: string; username: string; email: string; cursor?: { line: number; column: number } | null; }
interface ConflictAlert { id: string; line: number; remoteUser: string; remoteContent: string; localContent: string; }

const THEME_KEY = "codesync.editor-theme";
const FONT_KEY = "codesync.editor-fontsize";

function detectLanguageFromName(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    js: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript",
    py: "python", java: "java", c: "c", cpp: "cpp", cs: "csharp", go: "go",
    rs: "rust", rb: "ruby", php: "php", html: "html", css: "css", json: "json",
    md: "markdown", sql: "sql", sh: "shell", yml: "yaml", yaml: "yaml",
  };
  return ext ? map[ext] ?? "plaintext" : "plaintext";
}

function EditorPage() {
  const { sessionId } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [session, setSession] = useState<SessionRow | null>(null);
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [presence, setPresence] = useState<Presence[]>([]);
  const [conflicts, setConflicts] = useState<ConflictAlert[]>([]);
  const [activityLog, setActivityLog] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const theme = (typeof window !== "undefined" && localStorage.getItem(THEME_KEY)) || "vs-dark";
  const fontSize = Number((typeof window !== "undefined" && localStorage.getItem(FONT_KEY)) || 14);

  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastRemoteContentRef = useRef<Record<string, string>>({});
  const recentLocalEditsRef = useRef<Record<number, number>>({});
  const localContentRef = useRef<Record<string, string>>({});
  const suppressNextChangeRef = useRef(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeDocIdRef = useRef<string | null>(null);

  useEffect(() => { activeDocIdRef.current = activeDocId; }, [activeDocId]);

  const activeDoc = useMemo(() => docs.find((d) => d.id === activeDocId) ?? null, [docs, activeDocId]);
  const pushActivity = (msg: string) => setActivityLog((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 100));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: s, error: sErr } = await supabase.from("sessions").select("*").eq("id", sessionId).maybeSingle();
      if (sErr || !s) { toast.error("Session not found or no access"); navigate({ to: "/sessions" }); return; }
      await supabase.from("participants").upsert({ session_id: s.id, user_id: user!.id }, { onConflict: "session_id,user_id" });

      const { data: d } = await supabase.from("documents").select("*").eq("session_id", sessionId).order("created_at", { ascending: true });
      if (cancelled) return;
      setSession(s as SessionRow);
      setDocs((d ?? []) as DocRow[]);
      const first = (d ?? [])[0];
      if (first) {
        setActiveDocId(first.id);
        localContentRef.current[first.id] = first.content;
        lastRemoteContentRef.current[first.id] = first.content;
      }
      setLoading(false);

      const channel = supabase.channel(`session:${sessionId}`, {
        config: { presence: { key: user!.id } },
      });

      channel.on("presence", { event: "sync" }, () => {
        const state = channel.presenceState() as Record<string, Presence[]>;
        const list: Presence[] = [];
        Object.values(state).forEach((arr) => arr.forEach((p) => list.push(p)));
        setPresence(list);
      });
      channel.on("presence", { event: "join" }, ({ newPresences }: any) => {
        newPresences.forEach((p: Presence) => pushActivity(`${p.username || p.email} joined`));
      });
      channel.on("presence", { event: "leave" }, ({ leftPresences }: any) => {
        leftPresences.forEach((p: Presence) => pushActivity(`${p.username || p.email} left`));
      });

      channel.on("broadcast", { event: "doc-edit" }, ({ payload }: any) => {
        if (payload.user_id === user!.id) return;
        handleRemoteEdit(payload);
      });

      channel.on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "documents", filter: `session_id=eq.${sessionId}` },
        (payload) => {
          const updated = payload.new as DocRow;
          setDocs((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
          lastRemoteContentRef.current[updated.id] = updated.content;
          if (updated.id === activeDocIdRef.current && updated.content !== localContentRef.current[updated.id]) {
            applyRemoteContent(updated.id, updated.content);
          }
        }
      );
      channel.on("postgres_changes",
        { event: "INSERT", schema: "public", table: "documents", filter: `session_id=eq.${sessionId}` },
        (payload) => {
          const d = payload.new as DocRow;
          setDocs((prev) => prev.some(x => x.id === d.id) ? prev : [...prev, d]);
        }
      );
      channel.on("postgres_changes",
        { event: "DELETE", schema: "public", table: "documents", filter: `session_id=eq.${sessionId}` },
        (payload) => {
          const d = payload.old as DocRow;
          setDocs((prev) => prev.filter((x) => x.id !== d.id));
        }
      );

      const { data: profile } = await supabase.from("profiles").select("username, email").eq("id", user!.id).maybeSingle();

      channel.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            user_id: user!.id,
            username: profile?.username ?? user!.email,
            email: user!.email,
            cursor: null,
          } as Presence);
        }
      });

      channelRef.current = channel;
      await supabase.from("activity_logs").insert({ user_id: user!.id, session_id: s.id, activity: `Opened session "${s.name}"` });
    })();

    return () => {
      cancelled = true;
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [sessionId]);

  const applyRemoteContent = (docId: string, content: string) => {
    if (!editorRef.current || activeDocIdRef.current !== docId) {
      localContentRef.current[docId] = content;
      return;
    }
    suppressNextChangeRef.current = true;
    const model = editorRef.current.getModel();
    if (model && model.getValue() !== content) {
      const fullRange = model.getFullModelRange();
      editorRef.current.executeEdits("remote", [{ range: fullRange, text: content }]);
    }
    localContentRef.current[docId] = content;
  };

  const handleRemoteEdit = (payload: {
    user_id: string; username: string; doc_id: string; content: string; line: number; ts: number;
  }) => {
    const localContent = localContentRef.current[payload.doc_id] ?? "";
    const recent = recentLocalEditsRef.current[payload.line];
    const isSameLineRecent = recent && payload.ts - recent < 3000;

    if (isSameLineRecent && payload.doc_id === activeDocIdRef.current) {
      const localLines = localContent.split("\n");
      const remoteLines = payload.content.split("\n");
      const localLine = localLines[payload.line - 1] ?? "";
      const remoteLine = remoteLines[payload.line - 1] ?? "";
      if (localLine !== remoteLine) {
        setConflicts((prev) => [
          ...prev,
          {
            id: `${payload.doc_id}-${payload.line}-${payload.ts}`,
            line: payload.line,
            remoteUser: payload.username,
            remoteContent: remoteLine,
            localContent: localLine,
          },
        ]);
        pushActivity(`Conflict with ${payload.username} on line ${payload.line}`);
        // Validate payload.user_id against tracked presence state before
        // attributing conflict to another user. Broadcast payloads are not
        // server-authenticated, so a malicious client could otherwise frame
        // any user. If not present, omit user_b rather than trust the claim.
        const presenceState = channelRef.current?.presenceState() as Record<string, Presence[]> | undefined;
        const verifiedRemote = presenceState && presenceState[payload.user_id]?.[0];
        supabase.from("conflicts").insert({
          document_id: payload.doc_id,
          user_a: user!.id,
          user_b: verifiedRemote ? payload.user_id : null,
          line_number: payload.line,
        });
        return;
      }
    }
    applyRemoteContent(payload.doc_id, payload.content);
    pushActivity(`${payload.username} edited line ${payload.line}`);
  };

  const broadcastEdit = useCallback((content: string, line: number) => {
    if (!channelRef.current || !activeDocIdRef.current) return;
    channelRef.current.send({
      type: "broadcast",
      event: "doc-edit",
      payload: {
        user_id: user!.id,
        username: user!.email,
        doc_id: activeDocIdRef.current,
        content,
        line,
        ts: Date.now(),
      },
    });
  }, [user]);

  const scheduleAutoSave = useCallback(() => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(async () => {
      const id = activeDocIdRef.current;
      if (!id) return;
      const content = localContentRef.current[id] ?? "";
      await supabase.from("documents").update({ content, updated_at: new Date().toISOString() }).eq("id", id);
    }, 1200);
  }, []);

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    editor.onDidChangeCursorPosition((e) => {
      if (channelRef.current) {
        const state = channelRef.current.presenceState() as Record<string, Presence[]>;
        const mine = state[user!.id]?.[0];
        channelRef.current.track({ ...(mine ?? { user_id: user!.id, username: user!.email!, email: user!.email! }), cursor: { line: e.position.lineNumber, column: e.position.column } } as Presence);
      }
    });
  };

  const onChange = (value: string | undefined) => {
    if (suppressNextChangeRef.current) { suppressNextChangeRef.current = false; return; }
    const id = activeDocIdRef.current;
    if (!id || value === undefined) return;
    localContentRef.current[id] = value;
    const pos = editorRef.current?.getPosition();
    const line = pos?.lineNumber ?? 1;
    recentLocalEditsRef.current[line] = Date.now();
    broadcastEdit(value, line);
    scheduleAutoSave();
  };

  const handleManualSave = async () => {
    if (!activeDoc) return;
    setSaving(true);
    const content = localContentRef.current[activeDoc.id] ?? activeDoc.content;
    await supabase.from("documents").update({ content, updated_at: new Date().toISOString() }).eq("id", activeDoc.id);
    const { data: latest } = await supabase.from("versions").select("version_number").eq("document_id", activeDoc.id).order("version_number", { ascending: false }).limit(1).maybeSingle();
    const next = (latest?.version_number ?? 0) + 1;
    await supabase.from("versions").insert({ document_id: activeDoc.id, version_number: next, content, created_by: user!.id });
    await supabase.from("activity_logs").insert({ user_id: user!.id, session_id: sessionId, activity: `Saved version ${next} of "${activeDoc.name}"` });
    setSaving(false);
    toast.success(`Saved v${next}`);
    pushActivity(`Saved version ${next}`);
  };

  const handleNewFile = async () => {
    const name = prompt("File name (e.g. utils.ts)");
    if (!name) return;
    const { data, error } = await supabase.from("documents").insert({
      session_id: sessionId, name, content: "", language: detectLanguageFromName(name),
    }).select().single();
    if (error || !data) { toast.error(error?.message ?? "Failed"); return; }
    setActiveDocId(data.id);
    localContentRef.current[data.id] = "";
    lastRemoteContentRef.current[data.id] = "";
  };

  const handleRename = async (doc: DocRow) => {
    const name = prompt("New file name", doc.name);
    if (!name || name === doc.name) return;
    const { error } = await supabase.from("documents").update({ name, language: detectLanguageFromName(name) }).eq("id", doc.id);
    if (error) toast.error(error.message);
  };

  const handleDeleteFile = async (doc: DocRow) => {
    if (!confirm(`Delete ${doc.name}?`)) return;
    const { error } = await supabase.from("documents").delete().eq("id", doc.id);
    if (error) { toast.error(error.message); return; }
    if (activeDocId === doc.id) {
      const remaining = docs.filter((d) => d.id !== doc.id);
      setActiveDocId(remaining[0]?.id ?? null);
    }
  };

  const switchFile = (id: string) => {
    setActiveDocId(id);
    const d = docs.find((x) => x.id === id);
    if (d && !(id in localContentRef.current)) {
      localContentRef.current[id] = d.content;
      lastRemoteContentRef.current[id] = d.content;
    }
  };

  const resolveConflict = async (c: ConflictAlert, choice: "mine" | "theirs" | "merge") => {
    if (!activeDoc) return;
    const content = localContentRef.current[activeDoc.id] ?? activeDoc.content;
    const lines = content.split("\n");
    let resolvedLine = lines[c.line - 1] ?? "";
    if (choice === "theirs") resolvedLine = c.remoteContent;
    else if (choice === "merge") resolvedLine = `${c.localContent}\n${c.remoteContent}`;
    if (choice !== "mine") {
      lines[c.line - 1] = resolvedLine;
      const newContent = lines.join("\n");
      applyRemoteContent(activeDoc.id, newContent);
      broadcastEdit(newContent, c.line);
      await supabase.from("documents").update({ content: newContent, updated_at: new Date().toISOString() }).eq("id", activeDoc.id);
    }
    await supabase.from("conflicts").update({ resolution: choice }).eq("document_id", activeDoc.id).eq("line_number", c.line).is("resolution", null);
    setConflicts((prev) => prev.filter((x) => x.id !== c.id));
    toast.success(`Conflict resolved: ${choice}`);
  };

  const findInEditor = () => {
    editorRef.current?.getAction("actions.find")?.run();
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  if (loading) {
    return <div className="flex h-screen items-center justify-center bg-background text-muted-foreground">Loading editor…</div>;
  }

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-card px-4">
        <div className="flex items-center gap-3">
          <Link to="/dashboard" className="font-semibold">CodeSync</Link>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm">{session?.name}</span>
          <button onClick={() => { navigator.clipboard.writeText(sessionId); toast.success("Session ID copied"); }}
            className="ml-2 rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground">
            ID: {sessionId.slice(0, 8)}…
          </button>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5" /> {presence.length} online
          </span>
          <button onClick={findInEditor} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent">
            <Search className="h-3.5 w-3.5" /> Find
          </button>
          <button onClick={handleManualSave} disabled={saving || !activeDoc}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            <Save className="h-3.5 w-3.5" /> {saving ? "Saving…" : "Save"}
          </button>
          {activeDoc && (
            <Link to="/version-history/$documentId" params={{ documentId: activeDoc.id }}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent">
              <GitBranch className="h-3.5 w-3.5" /> History
            </Link>
          )}
          <button onClick={handleLogout} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-accent">
            <LogOut className="h-3.5 w-3.5" /> Logout
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-sidebar">
          <div className="flex items-center justify-between px-3 py-2 text-xs uppercase text-muted-foreground">
            Files
            <button onClick={handleNewFile} className="rounded p-1 hover:bg-accent"><Plus className="h-3.5 w-3.5" /></button>
          </div>
          <ul className="flex-1 overflow-auto px-1">
            {docs.map((d) => (
              <li key={d.id} className={`group flex items-center justify-between rounded px-2 py-1 text-sm ${activeDocId === d.id ? "bg-accent" : "hover:bg-accent/60"}`}>
                <button onClick={() => switchFile(d.id)} className="flex flex-1 items-center gap-2 truncate text-left">
                  <FileCode2 className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="truncate">{d.name}</span>
                </button>
                <span className="ml-1 hidden gap-1 group-hover:flex">
                  <button onClick={() => handleRename(d)} className="rounded p-0.5 hover:bg-muted"><Edit2 className="h-3 w-3" /></button>
                  <button onClick={() => handleDeleteFile(d)} className="rounded p-0.5 hover:bg-muted text-destructive"><Trash2 className="h-3 w-3" /></button>
                </span>
              </li>
            ))}
          </ul>
          <div className="border-t border-border px-3 py-2 text-xs uppercase text-muted-foreground">Connected ({presence.length})</div>
          <ul className="max-h-48 overflow-auto px-2 pb-3">
            {presence.map((p) => (
              <li key={p.user_id} className="flex items-center gap-2 py-1 text-xs">
                <span className="inline-block h-2 w-2 rounded-full bg-success" />
                <span className="truncate">{p.username || p.email}</span>
                {p.cursor && <span className="text-muted-foreground">L{p.cursor.line}</span>}
              </li>
            ))}
          </ul>
        </aside>

        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-b border-border bg-card px-2">
            {docs.map((d) => (
              <button key={d.id} onClick={() => switchFile(d.id)}
                className={`flex items-center gap-2 rounded-t px-3 py-1.5 text-xs ${activeDocId === d.id ? "bg-background text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                {d.name}
              </button>
            ))}
          </div>

          <div className="flex-1">
            {activeDoc ? (
              <Editor
                height="100%"
                theme={theme}
                language={activeDoc.language || "plaintext"}
                value={localContentRef.current[activeDoc.id] ?? activeDoc.content}
                onChange={onChange}
                onMount={handleEditorMount}
                options={{
                  fontSize,
                  minimap: { enabled: false },
                  lineNumbers: "on",
                  automaticLayout: true,
                  scrollBeyondLastLine: false,
                  wordWrap: "on",
                }}
                path={activeDoc.id}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">No file open. Create one to get started.</div>
            )}
          </div>

          <div className="h-32 shrink-0 overflow-auto border-t border-border bg-card px-3 py-2 text-xs">
            <div className="mb-1 font-semibold text-muted-foreground">Activity</div>
            {activityLog.length === 0 ? (
              <div className="text-muted-foreground">No events yet.</div>
            ) : (
              activityLog.map((line, i) => <div key={i} className="mono">{line}</div>)
            )}
          </div>
        </div>

        <aside className="flex w-72 shrink-0 flex-col border-l border-border bg-sidebar">
          <div className="border-b border-border px-3 py-2">
            <div className="text-xs uppercase text-muted-foreground">Session Info</div>
            <div className="mt-2 text-sm font-medium">{session?.name}</div>
            <div className="mt-1 text-xs text-muted-foreground">Owner {session?.owner_id === user?.id ? "(you)" : ""}</div>
            <div className="mt-2 mono break-all text-[10px] text-muted-foreground">{sessionId}</div>
          </div>
          <div className="border-b border-border px-3 py-2">
            <div className="flex items-center gap-1 text-xs uppercase text-muted-foreground">
              <AlertTriangle className="h-3 w-3" /> Conflicts ({conflicts.length})
            </div>
            {conflicts.length === 0 ? (
              <div className="mt-2 text-xs text-muted-foreground">No conflicts</div>
            ) : (
              <ul className="mt-2 space-y-2">
                {conflicts.map((c) => (
                  <li key={c.id} className="rounded border border-destructive/30 bg-destructive/10 p-2 text-xs">
                    <div className="font-medium">Line {c.line} — {c.remoteUser}</div>
                    <div className="mt-1 mono"><span className="text-success">+ </span>{c.localContent || "(empty)"}</div>
                    <div className="mono"><span className="text-warning">~ </span>{c.remoteContent || "(empty)"}</div>
                    <div className="mt-2 flex gap-1">
                      <button onClick={() => resolveConflict(c, "mine")} className="flex-1 rounded bg-primary px-2 py-1 text-[10px] text-primary-foreground hover:bg-primary/90">Keep mine</button>
                      <button onClick={() => resolveConflict(c, "theirs")} className="flex-1 rounded border border-border px-2 py-1 text-[10px] hover:bg-accent">Keep theirs</button>
                      <button onClick={() => resolveConflict(c, "merge")} className="flex-1 rounded border border-border px-2 py-1 text-[10px] hover:bg-accent">Merge</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex-1 overflow-auto px-3 py-2">
            <div className="flex items-center gap-1 text-xs uppercase text-muted-foreground">
              <Bell className="h-3 w-3" /> Notifications
            </div>
            <ul className="mt-2 space-y-1">
              {activityLog.slice(0, 20).map((l, i) => (
                <li key={i} className="flex items-start gap-1 text-xs text-muted-foreground">
                  <X className="mt-0.5 h-2.5 w-2.5 opacity-0" />
                  <span>{l}</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
