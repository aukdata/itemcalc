import { expect, test } from "@playwright/test";

test.describe("editor", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(async () => {
      window.localStorage.clear();
      window.sessionStorage.clear();
      await new Promise<void>((resolve, reject) => {
        const request = window.indexedDB.deleteDatabase("itemcalc");
        request.onsuccess = () => {
          resolve();
        };
        request.onerror = () => {
          reject(request.error ?? new Error("Failed to delete itemcalc IndexedDB."));
        };
        request.onblocked = () => {
          resolve();
        };
      });
    });
    await page.reload();
  });

  test("calculates sample line and persists project name edits", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Polyethylene Demo" })).toBeVisible();

    const projectNameInput = page.getByTestId("project-name-input");
    await projectNameInput.fill("E2E Project");
    await expect(projectNameInput).toHaveValue("E2E Project");

    await page.waitForTimeout(900);
    await page.reload();

    await expect(page.locator('[data-testid="project-name-input"]')).toHaveValue("E2E Project");

    await page.getByTestId("calculate-button").click();
    await expect(page.getByTestId("result-summary")).toBeVisible();
    await expect
      .poll(async () => page.getByTestId("result-network-card").count())
      .toBeGreaterThan(0);

    await page.getByTestId("add-process-button").click();
    await expect(page.getByRole("heading", { name: "New Process" })).toBeVisible();
  });

  test("shows an error for invalid project imports", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Polyethylene Demo" })).toBeVisible();

    await page.getByTestId("import-input").setInputFiles({
      name: "broken-project.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"format":"itemcalc-project","formatVersion":1,"exportedAt":"2026-06-13T00:00:00.000Z","project":{"broken":true}}')
    });

    await expect(page.getByTestId("save-error-message")).toContainText("Invalid project import format.");
  });
});
