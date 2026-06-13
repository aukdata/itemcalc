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

  it("adds a process from the sidebar", async () => {
    const user = userEvent.setup();
    render(<EditorScreen />);

    expect(screen.getAllByText("Chemical Reactor")).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Add Process" }));

    expect(screen.getAllByText("New Process")).toHaveLength(1);
  });

  it("edits the selected process name through the sidebar", async () => {
    const user = userEvent.setup();
    render(<EditorScreen />);

    await user.click(screen.getByRole("button", { name: "node-reactor" }));

    const machineNameInput = screen.getByLabelText("Machine name");
    await user.clear(machineNameInput);
    await user.type(machineNameInput, "Polymerizer");

    expect(screen.getByDisplayValue("Polymerizer")).toBeInTheDocument();
    expect(useEditorStore.getState().project.line.processes.find((process) => process.id === "process-reactor")?.machineName).toBe("Polymerizer");
  });
});
