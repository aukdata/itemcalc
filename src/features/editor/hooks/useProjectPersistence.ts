import { useEffect, useMemo, useRef } from "react";
import { ProjectRepository, buildProjectExport } from "../../../persistence/repositories/projectRepository";
import { sampleProject } from "../sampleProject";
import { useEditorStore } from "../store/editorStore";

export function useProjectPersistence() {
  const repository = useMemo(() => new ProjectRepository(), []);
  const dirtyRevision = useEditorStore((state) => state.dirtyRevision);
  const markSaveError = useEditorStore((state) => state.markSaveError);
  const markSaved = useEditorStore((state) => state.markSaved);
  const markSaving = useEditorStore((state) => state.markSaving);
  const project = useEditorStore((state) => state.project);
  const replaceProject = useEditorStore((state) => state.replaceProject);
  const saveErrorMessage = useEditorStore((state) => state.saveErrorMessage);
  const saveState = useEditorStore((state) => state.saveState);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const existing = await repository.getCurrent();

        if (existing !== null) {
          replaceProject(existing);
          return;
        }

        replaceProject(sampleProject);
      } catch {
        replaceProject(sampleProject);
      }
    })();
  }, [replaceProject, repository]);

  useEffect(() => {
    if (dirtyRevision === 0) {
      return;
    }

    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }

    timerRef.current = window.setTimeout(() => {
      void (async () => {
        try {
          markSaving();
          const updatedProject = { ...project, updatedAt: new Date().toISOString() };
          await repository.save(updatedProject);
          markSaved(updatedProject.updatedAt);
        } catch (error) {
          markSaveError(error instanceof Error ? error.message : "Failed to save project.");
        }
      })();
    }, 750);

    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, [dirtyRevision, markSaveError, markSaved, markSaving, project, repository]);

  return {
    exportCurrentProject: () => {
      const payload = JSON.stringify(buildProjectExport(project), null, 2);
      const blob = new Blob([payload], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${project.name.replace(/[^A-Za-z0-9_-]+/g, "_") || "itemcalc-project"}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    },
    importProject: async (file: File) => {
      try {
        const text = await file.text();
        const parsed = JSON.parse(text) as unknown;
        const imported = repository.importDocument(parsed);
        await repository.save(imported);
        replaceProject(imported);
      } catch (error) {
        markSaveError(error instanceof Error ? error.message : "Failed to import project.");
      }
    },
    saveErrorMessage,
    saveState
  };
}
