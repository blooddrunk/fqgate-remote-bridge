/** Static, offline audit. It never imports/executes the module under review. */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, relative, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const prototypeRoot = resolve(root, "src/bridge/profiles") + sep;
const mp3Model = resolve(root, "tests/helpers/mp3-isolation-model.ts");
const mp3Tests = resolve(root, "tests/mp3-isolation.test.ts");
const diagnostics = new Set(
  ["profile-preflight.ts", "source-readiness.ts"].map((name) =>
    resolve(root, "src/fqgate/diagnostics", name),
  ),
);
const failures = [];
const graph = new Map();
const modules = [];
function walk(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = resolve(directory, name);
    return statSync(path).isDirectory() ? walk(path) : /\.[cm]?[jt]sx?$/.test(name) ? [path] : [];
  });
}
const productionFiles = ["src", "server", "config"].flatMap((name) => walk(resolve(root, name)));
const files = [...productionFiles, mp3Model, mp3Tests];
const config = ts.readConfigFile(resolve(root, "tsconfig.json"), ts.sys.readFile).config;
const compilerOptions = ts.convertCompilerOptionsFromJson(config.compilerOptions, root).options;
const forbidden = new Set([
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "EventSource",
  "Worker",
  "SharedWorker",
  "process",
  "global",
  "globalThis",
  "window",
  "document",
  "navigator",
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "console",
  "require",
  "eval",
  "Function",
  "Date",
  "setTimeout",
  "setInterval",
  "setImmediate",
  "Bun",
  "Deno",
]);
for (const file of files) {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const inside = file.startsWith(prototypeRoot);
  const research = file === mp3Model || file === mp3Tests;
  if (inside) modules.push(relative(root, file));
  const edges = [];
  function dependency(specifier) {
    const result = ts.resolveModuleName(specifier, file, compilerOptions, ts.sys).resolvedModule;
    const target = result && resolve(result.resolvedFileName);
    if (target) edges.push(target);
    if (inside && (!specifier.startsWith(".") || !target?.startsWith(prototypeRoot)))
      failures.push(`${relative(root, file)}: non-prototype dependency`);
    if (
      (file === mp3Model && specifier !== "node:path") ||
      (file === mp3Tests && specifier !== "vitest" && target !== mp3Model)
    )
      failures.push(`${relative(root, file)}: non-pure research dependency`);
    if (!research && (target === mp3Model || /mp3-isolation-model/.test(specifier)))
      failures.push(`${relative(root, file)}: production imports MP3 model`);
    if (
      !inside &&
      (target?.startsWith(prototypeRoot) || /(?:^|\/)profiles(?:\/|$)/.test(specifier))
    )
      failures.push(`${relative(root, file)}: production imports prototype`);
  }
  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    )
      dependency(node.moduleSpecifier.text);
    if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal)
    )
      dependency(node.argument.literal.text);
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))
    ) {
      const arg = node.arguments[0];
      if (arg && ts.isStringLiteral(arg)) dependency(arg.text);
      else if (inside || research || /profiles|mp3-isolation-model/.test(node.getText(source)))
        failures.push(`${relative(root, file)}: computed module load`);
    }
    if (
      (inside || research) &&
      ts.isIdentifier(node) &&
      forbidden.has(node.text) &&
      !(
        (ts.isPropertyAccessExpression(node.parent) ||
          ts.isPropertyAssignment(node.parent) ||
          ts.isPropertySignature(node.parent)) &&
        node.parent.name === node
      )
    )
      failures.push(`${relative(root, file)}: forbidden I/O/global ${node.text}`);
    ts.forEachChild(node, visit);
  }
  visit(source);
  graph.set(file, edges);
}
// Check reachability from EVERY non-prototype production source, including type/re-export edges.
for (const file of productionFiles.filter((file) => !file.startsWith(prototypeRoot))) {
  const seen = new Set();
  function reachable(current) {
    if (seen.has(current)) return false;
    seen.add(current);
    return (
      current.startsWith(prototypeRoot) ||
      current === mp3Model ||
      current === mp3Tests ||
      (graph.get(current) ?? []).some(reachable)
    );
  }
  if (reachable(file)) failures.push(`${relative(root, file)}: transitively reaches prototype`);
  if (!diagnostics.has(file)) {
    const visited = new Set();
    function reachesDiagnostic(current) {
      if (visited.has(current)) return false;
      visited.add(current);
      return diagnostics.has(current) || (graph.get(current) ?? []).some(reachesDiagnostic);
    }
    if (reachesDiagnostic(file))
      failures.push(`${relative(root, file)}: production reaches GET-only diagnostic`);
  }
}
if (modules.length !== 4) failures.push("unexpected prototype module set");
if (failures.length) throw new Error([...new Set(failures)].join("\n"));
globalThis.console.log(
  JSON.stringify({
    audit: "MP1_OFFLINE_BOUNDARY",
    productionFiles: productionFiles.length - modules.length,
    prototypeModules: modules,
    productionImportPaths: 0,
    externalPrototypeDependencies: 0,
    forbiddenIOGlobals: 0,
    mp3TestOnlyModel: relative(root, mp3Model),
    productionImportsOfMp3Model: 0,
    productionImportsOfReadinessDiagnostic: 0,
  }),
);
