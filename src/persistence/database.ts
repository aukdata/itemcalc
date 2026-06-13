import Dexie, { type EntityTable } from "dexie";

export interface ProjectRecord {
  id: string;
  name: string;
  schemaVersion: number;
  updatedAt: string;
  data: unknown;
}

class ItemCalcDatabase extends Dexie {
  projects!: EntityTable<ProjectRecord, "id">;

  constructor() {
    super("itemcalc");

    this.version(1).stores({
      projects: "id, name, updatedAt",
      settings: "key"
    });

    this.version(2).stores({
      projects: "id, name, updatedAt"
    });
  }
}

export const database = new ItemCalcDatabase();
