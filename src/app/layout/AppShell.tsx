import { EditorScreen } from "../../features/editor/EditorScreen";

export function AppShell() {
  return (
    <div className="app-shell">
      <header className="hero">
        <p className="eyebrow">GregTech Flow Planner</p>
        <h1>ItemCalc</h1>
        <p className="lede">
          Steady-state line design with compiled material networks, LP solving, and worker-backed
          throughput analysis.
        </p>
      </header>
      <main className="workspace">
        <EditorScreen />
      </main>
    </div>
  );
}
