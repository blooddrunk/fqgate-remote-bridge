/** A local browser readiness gate. It never begins QR or sends an HTTP request. */
export const QR_READY_TITLE = "FQGate QR acceptance ready";
export const QR_READY_BUTTON = "窗口已显示，开始这次已批准的扫码";
export async function prepareQrOperatorWindow(page) {
  await page.setContent(
    `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>${QR_READY_TITLE}</title><body style="font:20px system-ui;padding:40px;max-width:760px"><h1>扫码验证准备</h1><p>此页尚未生成二维码。请准备好自己的手机应用。</p><p>点击下方按钮后，会为当前选定实例开始一次已批准的登录，可能替换其现有登录。不要更改其他 source。</p><button id="ready" style="font:inherit;padding:16px;cursor:pointer">${QR_READY_BUTTON}</button><p>没有点击就不会生成二维码。可直接关闭窗口。</p><script>document.getElementById('ready').addEventListener('click',function(){window.__fqgateQrOperatorReady=true;this.disabled=true;});</script></body></html>`,
  );
  await page.bringToFront();
}
export async function waitForQrOperatorWindow(page, timeoutMs = 120000) {
  try {
    await page.waitForFunction(() => globalThis.__fqgateQrOperatorReady === true, undefined, {
      timeout: timeoutMs,
    });
  } catch {
    throw Error("OPERATOR_WINDOW_NOT_CONFIRMED");
  }
}
