import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const workflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
const windowsSuites = [
  ["Windows script CLI smoke test", ["bootstrap.ps1", "acceptance.ps1", "-VerifyCli"]],
  ["Windows production loopback smoke test", ["acceptance.ps1", "-VerifyBridge"]],
  [
    "Windows acceptance vault tests",
    ["test-acceptance-credential-vault.ps1", "smoke-acceptance-credential-vault.ps1"],
  ],
  [
    "Windows v2 observation boundary smoke",
    [
      "test-fqgate-v2-observation.ps1",
      "test-fqgate205-qr-preflight.ps1",
      "test-fqgate205-qr-identity.mjs",
      "test-fqgate205-mp2-native.ps1",
      "test-fqgate205-mp3-native.ps1",
      "test-fqgate205-mp4-cli.ps1",
      "test-fqgate205-mp6-host.ps1",
      "test-fqgate-mp8.mjs",
    ],
  ],
] as const;

// Deliberately static: inspect policy without executing workflow or native commands.
function checkPolicy(source: string) {
  source = source.replaceAll("\r\n", "\n");
  const blocks = source.split(/^ {6}- name: /m);
  const step = (name: string) => {
    const matches = blocks.filter((block) => block.startsWith(`${name}\n`));
    expect(matches, name).toHaveLength(1);
    return matches[0]!;
  };
  const checkout = step("Checkout");
  expect(checkout).not.toMatch(/^\s+(ref|repository):/m);
  expect(checkout).not.toMatch(/^\s+(if|continue-on-error):/m);
  expect(checkout).toContain("persist-credentials: false");
  expect(step("Verify tested revision")).toMatch(/\n {8}run: node scripts\/ci-revision\.mjs\s*$/);
  expect(step("Verify tested revision")).not.toMatch(/^\s+(if|continue-on-error):/m);
  expect(source).toContain("permissions:\n  contents: read\n");
  expect(source).not.toMatch(
    /pull_request_target|continue-on-error:|upload-artifact|contents: write/,
  );
  expect(source).toContain(
    "group: ci-${{ github.workflow }}-${{ github.event.pull_request.number || github.run_id }}",
  );
  expect(source).toContain("cancel-in-progress: ${{ github.event_name == 'pull_request' }}");
  expect(source).toContain("timeout-minutes: 20");
  expect(source).toContain("fail-fast: false");
  expect(source).toContain("os: [ubuntu-24.04, windows-latest]");
  const actions = [...source.matchAll(/uses: (\S+)/g)].map((match) => match[1]);
  expect(actions).toEqual([
    "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
    "pnpm/action-setup@73e46992e05b19abd31f2f3c20e0e7370d762115",
    "actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1",
  ]);
  for (const [name, command] of [
    ["Install dependencies", "pnpm install --frozen-lockfile"],
    ["Test", "pnpm test"],
    ["Build", "pnpm build"],
  ]) {
    expect(step(name!)).toContain(`run: ${command}`);
    expect(step(name!)).not.toMatch(/^\s+if:/m);
  }
  for (const [name, command] of [
    ["Typecheck", "pnpm typecheck"],
    ["Lint", "pnpm lint"],
    ["Offline profile boundary audit", "node scripts/audit-profile-prototype.mjs"],
    [
      "Install Playwright Chromium",
      "pnpm exec playwright install --with-deps --only-shell chromium",
    ],
    ["Browser E2E tests", "pnpm test:e2e"],
    ["Format check", "pnpm format:check"],
  ]) {
    expect(step(name!)).toContain("if: runner.os == 'Linux'");
    expect(step(name!)).toContain(`run: ${command}`);
  }
  for (const [name, commands] of windowsSuites) {
    const block = step(name);
    expect(block).toContain("if: runner.os == 'Windows'\n");
    expect(block).toContain("shell: pwsh\n");
    for (const command of commands) expect(block).toContain(command);
  }
  // The provenance script consumes event JSON; no PR text is interpolated into a shell.
  for (const block of blocks) {
    const run = block.split(/\n {8}run: /)[1];
    if (run) expect(run).not.toContain("${{");
  }
}

describe("CI workflow policy", () => {
  it("keeps merge checkout, least privilege, resource limits and both platforms' duties", () => {
    checkPolicy(workflow);
  });
  it.each<[string, (source: string) => string]>([
    [
      "head-only checkout",
      (s: string) =>
        s.replace(
          "persist-credentials: false",
          "ref: ${{ github.event.pull_request.head.sha || github.sha }}\n          persist-credentials: false",
        ),
    ],
    [
      "missing provenance",
      (s: string) => s.replace("node scripts/ci-revision.mjs", "node --version"),
    ],
    [
      "Windows matrix removal",
      (s: string) => s.replace("ubuntu-24.04, windows-latest", "ubuntu-24.04"),
    ],
    [
      "conditional unit tests",
      (s: string) =>
        s.replace("- name: Test\n", "- name: Test\n        if: runner.os == 'Linux'\n"),
    ],
    [
      "disabled Windows suites",
      (s: string) => s.replaceAll("if: runner.os == 'Windows'", "if: false"),
    ],
    ...windowsSuites.flatMap(([, commands]) =>
      commands.map(
        (command) =>
          [`missing ${command}`, (s: string) => s.replaceAll(command, "removed-fixture")] as [
            string,
            (source: string) => string,
          ],
      ),
    ),
  ])("rejects %s", (_name, mutate) => {
    expect(() => checkPolicy(mutate(workflow))).toThrow();
  });
});

const directory = mkdtempSync(join(tmpdir(), "mp10-ci-revision-"));
afterAll(() => rmSync(directory, { recursive: true, force: true }));
const env = {
  ...process.env,
  GIT_AUTHOR_NAME: "CI fixture",
  GIT_AUTHOR_EMAIL: "fixture@example.invalid",
  GIT_COMMITTER_NAME: "CI fixture",
  GIT_COMMITTER_EMAIL: "fixture@example.invalid",
  GIT_AUTHOR_DATE: "2026-11-06T00:00:00Z",
  GIT_COMMITTER_DATE: "2026-11-06T00:00:00Z",
};
const git = (...args: string[]) =>
  execFileSync("git", args, { cwd: directory, env, encoding: "utf8", input: "" }).trim();
git("init", "--quiet");
const tree = git("mktree");
const base = git("commit-tree", tree, "-m", "base");
const head = git("commit-tree", tree, "-p", base, "-m", "head");
const merge = git("commit-tree", tree, "-p", base, "-p", head, "-m", "merge");
const script = fileURLToPath(new URL("../scripts/ci-revision.mjs", import.meta.url));
function revision({
  tested = merge,
  expected = merge,
  source = head,
  parent = base,
  ref = "refs/pull/38/merge",
  event = "pull_request",
} = {}) {
  git("update-ref", "HEAD", tested);
  // Model checkout's actual shallow boundary, not a deep-clone-only success.
  writeFileSync(join(directory, ".git", "shallow"), `${tested}\n`);
  const eventPath = join(directory, "event.json");
  writeFileSync(
    eventPath,
    JSON.stringify({ number: 38, pull_request: { head: { sha: source }, base: { sha: parent } } }),
  );
  return spawnSync(process.execPath, [script], {
    cwd: directory,
    encoding: "utf8",
    env: {
      ...env,
      GITHUB_EVENT_NAME: event,
      GITHUB_SHA: expected,
      GITHUB_REF: ref,
      GITHUB_EVENT_PATH: eventPath,
    },
  });
}

describe("tested revision provenance (synthetic Git commits only)", () => {
  it("separates shallow merge candidate, source head and base", () => {
    const result = revision();
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      event: "pull_request",
      ref: "refs/pull/38/merge",
      sourceHeadSha: head,
      baseSha: base,
      testedMergeSha: merge,
    });
  });
  it.each([
    ["head checkout", { tested: head, expected: head }],
    ["unexpected checkout", { tested: head }],
    ["unavailable merge ref", { ref: "refs/pull/38/head" }],
    ["stale head", { source: base }],
    ["changed base", { parent: head }],
    ["injected revision", { source: "$(touch injected)" }],
    ["unsupported event", { event: "pull_request_target" }],
  ])("denies %s without fallback", (_name, options) => {
    const result = revision(options);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("CI_REVISION_INVALID");
    expect(result.stderr).not.toContain("$(touch injected)");
  });
  it("preserves main push verification", () => {
    const result = revision({
      tested: head,
      expected: head,
      event: "push",
      ref: "refs/heads/main",
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      event: "push",
      ref: "refs/heads/main",
      sourceHeadSha: head,
      testedSha: head,
    });
  });
});
