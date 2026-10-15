import { expect, test } from "@playwright/test";
import {
  prepareQrOperatorWindow,
  waitForQrOperatorWindow,
  QR_READY_BUTTON,
} from "../../scripts/windows/fqgate205-qr-window.mjs";

test("requires a real readiness click without any QR or network request", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.method()));
  await prepareQrOperatorWindow(page);
  let confirmed = false;
  const ready = waitForQrOperatorWindow(page, 5000).then(() => {
    confirmed = true;
  });
  await expect(page.getByRole("button", { name: QR_READY_BUTTON })).toBeVisible();
  expect(confirmed).toBe(false);
  expect(requests).toEqual([]);
  await page.getByRole("button", { name: QR_READY_BUTTON }).click();
  await ready;
  expect(confirmed).toBe(true);
  expect(requests).toEqual([]);
  await expect(page.locator("img")).toHaveCount(0);
});
test("times out without confirming or making a request", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.method()));
  await prepareQrOperatorWindow(page);
  await expect(waitForQrOperatorWindow(page, 100)).rejects.toThrow("OPERATOR_WINDOW_NOT_CONFIRMED");
  expect(requests).toEqual([]);
});
test("closing the preparation window cannot authorize QR", async ({ page }) => {
  await prepareQrOperatorWindow(page);
  const ready = waitForQrOperatorWindow(page, 5000);
  const rejection = expect(ready).rejects.toThrow("OPERATOR_WINDOW_NOT_CONFIRMED");
  await page.close();
  await rejection;
});
