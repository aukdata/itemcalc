import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { sampleProject } from "./sampleProject";
import { EditorScreen } from "./EditorScreen";
import { useEditorStore } from "./store/editorStore";

vi.mock("./hooks/useProjectPersistence", () => ({
  useProjectPersistence: () => ({
    exportCurrentProject: vi.fn(),
    importProject: vi.fn(),
    saveErrorMessage: null,
    saveState: "saved"
  })
}));

vi.mock("./ProductionLineCanvas", () => ({
  ProductionLineCanvas: ({ project }: { project: typeof sampleProject }) => (
    <div data-testid="canvas-mock">
      {project.editor.nodes.map((node) => (
        <button
          key={node.id}
          onClick={() => {
            useEditorStore.getState().selectNode(node.id);
          }}
          type="button"
        >
          {node.id}
        </button>
      ))}
    </div>
  )
}));

describe("EditorScreen", () => {
  beforeEach(() => {
    useEditorStore.getState().replaceProject(sampleProject);
    useEditorStore.getState().clearSelection();
  });

  it("adds a process from the toolbar", async () => {
    const user = userEvent.setup();
    render(<EditorScreen />);

    expect(
      useEditorStore.getState().project.line.processes.find((process) => process.id === "process-reactor")
        ?.machineName
    ).toBe("\u5316\u5b66\u53cd\u5fdc\u6a5f");

    await user.click(
      screen.getByRole("button", { name: "\u30d7\u30ed\u30bb\u30b9\u8ffd\u52a0" })
    );

    expect(
      useEditorStore.getState().project.line.processes.some(
        (process) => process.machineName === "\u65b0\u3057\u3044\u30d7\u30ed\u30bb\u30b9"
      )
    ).toBe(true);
  });

  it("edits the selected process name through the sidebar", async () => {
    const user = userEvent.setup();
    render(<EditorScreen />);

    await user.click(screen.getByRole("button", { name: "node-reactor" }));

    const machineNameInput = screen.getByDisplayValue("\u5316\u5b66\u53cd\u5fdc\u6a5f");
    await user.clear(machineNameInput);
    await user.type(machineNameInput, "\u91cd\u5408\u88c5\u7f6e");

    expect(screen.getByDisplayValue("\u91cd\u5408\u88c5\u7f6e")).toBeInTheDocument();
    expect(
      useEditorStore.getState().project.line.processes.find((process) => process.id === "process-reactor")
        ?.machineName
    ).toBe("\u91cd\u5408\u88c5\u7f6e");
  });

  it("supports copy, paste, and delete keyboard shortcuts outside inputs", async () => {
    const user = userEvent.setup();
    render(<EditorScreen />);

    await user.click(screen.getByRole("button", { name: "node-reactor" }));

    await user.keyboard("{Control>}c{/Control}");
    await user.keyboard("{Control>}v{/Control}");

    expect(
      useEditorStore.getState().project.line.processes.some(
        (process) => process.machineName === "\u5316\u5b66\u53cd\u5fdc\u6a5f \u30b3\u30d4\u30fc"
      )
    ).toBe(true);

    await user.keyboard("{Delete}");

    expect(
      useEditorStore.getState().project.line.processes.some(
        (process) => process.machineName === "\u5316\u5b66\u53cd\u5fdc\u6a5f \u30b3\u30d4\u30fc"
      )
    ).toBe(false);
  });
});
