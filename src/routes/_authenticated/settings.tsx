import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { toast } from "sonner";

const THEME_KEY = "codesync.editor-theme";
const FONT_KEY = "codesync.editor-fontsize";

export const Route = createFileRoute("/_authenticated/settings")({ component: SettingsPage });

function SettingsPage() {
  const [theme, setTheme] = useState(() => (typeof window !== "undefined" && localStorage.getItem(THEME_KEY)) || "vs-dark");
  const [fontSize, setFontSize] = useState(() => Number((typeof window !== "undefined" && localStorage.getItem(FONT_KEY)) || 14));

  const save = () => {
    localStorage.setItem(THEME_KEY, theme);
    localStorage.setItem(FONT_KEY, String(fontSize));
    toast.success("Settings saved");
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-xl p-8">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Editor preferences.</p>
        <div className="mt-6 space-y-4 rounded-lg border border-border bg-card p-6">
          <div>
            <label className="text-sm">Editor theme</label>
            <select value={theme} onChange={(e)=>setTheme(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-input px-3 py-2 text-sm">
              <option value="vs-dark">Dark</option>
              <option value="hc-black">High contrast</option>
              <option value="vs">Light</option>
            </select>
          </div>
          <div>
            <label className="text-sm">Font size: {fontSize}px</label>
            <input type="range" min={10} max={22} value={fontSize} onChange={(e)=>setFontSize(Number(e.target.value))} className="mt-1 w-full" />
          </div>
          <button onClick={save} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Save
          </button>
        </div>
      </div>
    </AppShell>
  );
}
