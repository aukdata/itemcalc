import { useId } from "react";

interface EditorToolbarProps {
  canDeleteSelection: boolean;
  isCalculating: boolean;
  onCalculate: () => void;
  onCreateNode: (kind: "process" | "externalInput" | "targetOutput" | "disposal") => void;
  onDeleteSelected: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onNewProject: () => void;
  onProjectNameChange: (name: string) => void;
  onRedo: () => void;
  onUndo: () => void;
  projectName: string;
  saveState: string;
}

const labels = {
  projectName: "\u30d7\u30ed\u30b8\u30a7\u30af\u30c8\u540d",
  status: "\u72b6\u614b",
  calculating: "\u8a08\u7b97\u4e2d...",
  calculate: "\u8a08\u7b97",
  newProject: "\u65b0\u898f",
  undo: "\u5143\u306b\u623b\u3059",
  redo: "\u3084\u308a\u76f4\u3059",
  exportJson: "JSON\u66f8\u304d\u51fa\u3057",
  importJson: "JSON\u8aad\u307f\u8fbc\u307f",
  addProcess: "\u30d7\u30ed\u30bb\u30b9\u8ffd\u52a0",
  addInput: "\u5165\u529b\u8ffd\u52a0",
  addTarget: "\u76ee\u6a19\u8ffd\u52a0",
  addDisposal: "\u5ec3\u68c4\u5148\u8ffd\u52a0",
  remove: "\u524a\u9664",
  shortcut: "\u30b7\u30e7\u30fc\u30c8\u30ab\u30c3\u30c8: Ctrl+C / Ctrl+V / Delete",
  saved: "\u4fdd\u5b58\u6e08\u307f",
  saving: "\u4fdd\u5b58\u4e2d",
  saveError: "\u4fdd\u5b58\u30a8\u30e9\u30fc",
  unsaved: "\u672a\u4fdd\u5b58"
} as const;

function translateSaveState(saveState: string) {
  switch (saveState) {
    case "saved":
      return labels.saved;
    case "saving":
      return labels.saving;
    case "saveError":
      return labels.saveError;
    case "unsaved":
    default:
      return labels.unsaved;
  }
}

export function EditorToolbar({
  canDeleteSelection,
  isCalculating,
  onCalculate,
  onCreateNode,
  onDeleteSelected,
  onExport,
  onImport,
  onNewProject,
  onProjectNameChange,
  onRedo,
  onUndo,
  projectName,
  saveState
}: EditorToolbarProps) {
  const fileInputId = useId();

  return (
    <section className="panel toolbar">
      <div className="toolbar__project">
        <label className="toolbar__project-label" htmlFor="project-name-input">
          {labels.projectName}
        </label>
        <input
          className="field-input toolbar__project-input"
          data-testid="project-name-input"
          id="project-name-input"
          onChange={(event) => {
            onProjectNameChange(event.target.value);
          }}
          type="text"
          value={projectName}
        />
        <span className="toolbar__status">
          {labels.status}: {translateSaveState(saveState)}
        </span>
      </div>
      <div className="toolbar__actions">
        <button
          className="action-button toolbar__button"
          data-testid="calculate-button"
          disabled={isCalculating}
          onClick={onCalculate}
          type="button"
        >
          {isCalculating ? labels.calculating : labels.calculate}
        </button>
        <button className="secondary-button toolbar__button" onClick={onNewProject} type="button">
          {labels.newProject}
        </button>
        <button className="secondary-button toolbar__button" onClick={onUndo} type="button">
          {labels.undo}
        </button>
        <button className="secondary-button toolbar__button" onClick={onRedo} type="button">
          {labels.redo}
        </button>
        <button className="secondary-button toolbar__button" onClick={onExport} type="button">
          {labels.exportJson}
        </button>
        <label className="file-button toolbar__button" htmlFor={fileInputId}>
          {labels.importJson}
        </label>
        <input
          accept="application/json"
          className="visually-hidden"
          data-testid="import-input"
          id={fileInputId}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file !== undefined) {
              onImport(file);
              event.target.value = "";
            }
          }}
          type="file"
        />
        <button
          className="secondary-button toolbar__button"
          data-testid="add-process-button"
          onClick={() => {
            onCreateNode("process");
          }}
          type="button"
        >
          {labels.addProcess}
        </button>
        <button
          className="secondary-button toolbar__button"
          onClick={() => {
            onCreateNode("externalInput");
          }}
          type="button"
        >
          {labels.addInput}
        </button>
        <button
          className="secondary-button toolbar__button"
          onClick={() => {
            onCreateNode("targetOutput");
          }}
          type="button"
        >
          {labels.addTarget}
        </button>
        <button
          className="secondary-button toolbar__button"
          onClick={() => {
            onCreateNode("disposal");
          }}
          type="button"
        >
          {labels.addDisposal}
        </button>
        <button
          className="secondary-button toolbar__button"
          disabled={!canDeleteSelection}
          onClick={onDeleteSelected}
          type="button"
        >
          {labels.remove}
        </button>
      </div>
    </section>
  );
}
