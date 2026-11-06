/** CI-only provenance gate. No network, checkout fallback, credentials or runtime access. */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import process from "node:process";
import console from "node:console";

try {
  const sha = (value) => {
    if (typeof value !== "string" || !/^[a-f0-9]{40}$/.test(value))
      throw new Error("Missing or invalid revision SHA");
    return value;
  };
  const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
  const testedSha = sha(git("rev-parse", "HEAD"));
  const eventSha = sha(process.env.GITHUB_SHA);
  if (testedSha !== eventSha) throw new Error("Checkout differs from event tested SHA");
  if (process.env.GITHUB_EVENT_NAME === "pull_request") {
    const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
    if (!Number.isSafeInteger(event.number) || event.number < 1)
      throw new Error("Missing PR number");
    const ref = `refs/pull/${event.number}/merge`;
    if (process.env.GITHUB_REF !== ref) throw new Error("PR merge ref unavailable");
    const sourceHeadSha = sha(event.pull_request?.head?.sha);
    const baseSha = sha(event.pull_request?.base?.sha);
    // Raw commit headers retain parents even with checkout's shallow fetch-depth=1.
    const headers = git("cat-file", "-p", "HEAD").split("\n\n", 1)[0];
    const parents = headers.split("\n").filter((line) => line.startsWith("parent "));
    if (
      testedSha === sourceHeadSha ||
      parents.length !== 2 ||
      parents[0] !== `parent ${baseSha}` ||
      parents[1] !== `parent ${sourceHeadSha}`
    )
      throw new Error("PR merge candidate missing or stale: revalidate current base/head");
    console.log(
      JSON.stringify({
        event: "pull_request",
        ref,
        sourceHeadSha,
        baseSha,
        testedMergeSha: testedSha,
      }),
    );
  } else if (
    process.env.GITHUB_EVENT_NAME === "push" &&
    process.env.GITHUB_REF === "refs/heads/main"
  ) {
    console.log(
      JSON.stringify({
        event: "push",
        ref: "refs/heads/main",
        sourceHeadSha: testedSha,
        testedSha,
      }),
    );
  } else throw new Error("Unsupported CI event/ref");
} catch {
  console.error(
    "CI_REVISION_INVALID: expected event revision and PR merge parents; no head fallback",
  );
  process.exitCode = 1;
}
