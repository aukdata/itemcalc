import { EditorScreen } from "../../features/editor/EditorScreen";

export function AppShell() {
  return (
    <div className="app-shell">
      <header className="hero compact-hero">
        <div>
          <p className="eyebrow">GregTech フロープランナー</p>
          <h1>ItemCalc</h1>
        </div>
        <p className="lede">生産ラインの計算、編集、保存を1画面で扱えます。</p>
      </header>
      <main className="workspace">
        <EditorScreen />
      </main>
    </div>
  );
}
