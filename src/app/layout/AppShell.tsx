import { EditorScreen } from "../../features/editor/EditorScreen";

const eyebrow = "GregTech \u30d5\u30ed\u30fc\u30d7\u30e9\u30f3\u30ca\u30fc";

export function AppShell() {
  return (
    <div className="app-shell">
      <header className="hero compact-hero compact-hero--single">
        <p className="eyebrow">{eyebrow}</p>
        <h1>ItemCalc</h1>
      </header>
      <main className="workspace">
        <EditorScreen />
      </main>
    </div>
  );
}
