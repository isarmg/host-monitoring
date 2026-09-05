import assert from "node:assert/strict";
import { chromium, firefox } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { preview } from "vite";

const session = { authenticated: true, user_id: "A".repeat(43), username: "admin", role: "admin", csrf_token: "A".repeat(43) };
function host(index) {
  return {
    id: "018f1f4b-7a5d-7b5f-8d31-" + String(index).padStart(12, "0"), name: "Host-" + index,
    os: "linux", os_version: null, kernel_version: null, arch: "x86_64", agent_version: "0.8.0",
    registered_at: "2026-09-04T00:00:00Z", last_seen_at: "2026-09-04T00:00:00Z", latest_collected_at: null,
    status: "online", capabilities: [], cpu_usage_percent: null, memory_usage_percent: 25,
    network_received_bytes_per_second: null, network_transmitted_bytes_per_second: null,
    disk_read_bytes_per_second: null, disk_written_bytes_per_second: null,
    max_temperature_celsius: null, gpu_utilization_percent: null, gpu_memory_usage_percent: null,
  };
}
const server = await preview({ preview: { host: "127.0.0.1", port: 0, strictPort: true } });
const address = server.httpServer.address();
assert.ok(address && typeof address === "object");
try {
  for (const engine of [chromium, firefox]) {
    const browser = await engine.launch();
    try {
      const context = await browser.newContext({ viewport: { width: 360, height: 740 } });
      const page = await context.newPage();
      const errors = [];
      const requested = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route("**/api/v2/**", route => {
        const url = new URL(route.request().url());
        const offset = Number(url.searchParams.get("offset") ?? "0");
        const isHosts = url.pathname.endsWith("/monitoring/hosts");
        if (isHosts) requested.push(offset);
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(isHosts
          ? { hosts: offset === 0 ? Array.from({ length: 50 }, (_, index) => host(index)) : [host(50)], total: 51, limit: 50, offset }
          : session) });
      });
      await page.goto(`http://127.0.0.1:${address.port}`);
      await page.getByRole("heading", { name: "主机监控" }).waitFor();
      await page.getByRole("rowheader", { name: "Host-0", exact: true }).waitFor();
      await page.getByRole("button", { name: "下一页" }).click();
      await page.getByRole("rowheader", { name: "Host-50", exact: true }).waitFor();
      assert.ok(requested.includes(50));
      await page.getByText("完整采集信息").click();
      await page.getByText("agent_version", { exact: true }).waitFor();
      for (const theme of ["light", "dark"]) {
        await page.getByLabel("Theme").selectOption(theme);
        const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
        assert.deepEqual(result.violations, []);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      }
      assert.deepEqual(errors, []);
      console.log(`${engine.name()}: current Host build, pagination, full details and mobile light/dark WCAG AA passed`);
      await context.close();
    } finally { await browser.close(); }
  }
} finally { await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve())); }
