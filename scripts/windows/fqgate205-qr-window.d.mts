import type { Page } from "@playwright/test";
export const QR_READY_TITLE: string;
export const QR_READY_BUTTON: string;
export function prepareQrOperatorWindow(page: Page): Promise<void>;
export function waitForQrOperatorWindow(page: Page, timeoutMs?: number): Promise<void>;
