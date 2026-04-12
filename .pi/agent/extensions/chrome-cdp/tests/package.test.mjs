import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(readFileSync(resolve(rootDir, "package.json"), "utf8"));
const extensionPath = resolve(rootDir, "index.ts");
const skillPath = resolve(rootDir, "skills/chrome-cdp/SKILL.md");

function assertReferencedPathsExist(markdownPath) {
  const content = readFileSync(markdownPath, "utf8");
  const matches = [...content.matchAll(/\b(?:\.\.\/|\.\/)?[A-Za-z0-9_./-]+\/cdp\.mjs\b/g)];

  assert.ok(matches.length > 0, `Expected ${markdownPath} to reference cdp.mjs`);

  const referencedPaths = [...new Set(matches.map((match) => match[0]))];
  for (const referencedPath of referencedPaths) {
    const resolvedPath = resolve(dirname(markdownPath), referencedPath);
    assert.ok(
      existsSync(resolvedPath),
      `${markdownPath} references ${referencedPath}, but ${resolvedPath} does not exist`,
    );
  }
}

function extractDomHelpersTemplate(source) {
  const match = source.match(/function domHelpersSource\(\): string \{\n  return `([\s\S]*?)`;\n\}/);
  assert.ok(match, "Expected domHelpersSource template literal in extension entrypoint");
  return match[1];
}

test("README command references point at real scripts", () => {
  assertReferencedPathsExist(resolve(rootDir, "README.md"));
});

test("skill command references point at real scripts", () => {
  assertReferencedPathsExist(skillPath);
});

test("package manifest exports the chrome-cdp extension", () => {
  assert.ok(existsSync(extensionPath), `Missing extension file: ${extensionPath}`);
  assert.deepEqual(packageJson.pi.extensions, ["./index.ts"]);
  assert.deepEqual(packageJson.pi.skills, ["./skills"]);
});

test("package metadata credits the local authors", () => {
  assert.equal(packageJson.author, "Bjoern Aagaard and OpenAI");
});

test("README documents the extension slash commands", () => {
  const readme = readFileSync(resolve(rootDir, "README.md"), "utf8");
  assert.match(readme, /\/chrome-tabs/);
  assert.match(readme, /\/chrome help/);
  assert.match(readme, /\/chrome snap/);
});

test("README explains auto-loading via the extensions directory", () => {
  const readme = readFileSync(resolve(rootDir, "README.md"), "utf8");
  assert.match(readme, /~\/\.pi\/agent\/extensions\/chrome-cdp/);
  assert.match(readme, /\/reload/);
});

test("root extension entrypoint bundles skill discovery and slash commands", () => {
  const entrypoint = readFileSync(extensionPath, "utf8");
  assert.match(entrypoint, /resources_discover/);
  assert.match(entrypoint, /skillPaths/);
  assert.match(entrypoint, /registerCommand\("chrome"/);
  assert.match(entrypoint, /registerCommand\("chrome-tabs"/);
});

test("extension exposes a chrome_cdp tool so the agent does not need bash path discovery", () => {
  const entrypoint = readFileSync(extensionPath, "utf8");
  assert.match(entrypoint, /registerTool\(\{[\s\S]*name:\s*"chrome_cdp"/);
  assert.match(entrypoint, /promptGuidelines:\s*\[[\s\S]*Do not use bash/i);
});

test("skill tells the agent to prefer the extension tool before raw script commands", () => {
  const skill = readFileSync(skillPath, "utf8");
  assert.match(skill, /prefer the `chrome_cdp` tool/i);
  assert.match(skill, /Only fall back to `scripts\/cdp\.mjs` if the tool is unavailable/i);
});


test("chrome_cdp adds structured accessibility snapshot and audit capabilities", () => {
  const entrypoint = readFileSync(extensionPath, "utf8");
  assert.match(entrypoint, /"audit_accessibility"/);
  assert.match(entrypoint, /format:\s*Type\.Optional\(StringEnum\(\["text", "json"\]/);
  assert.match(
    entrypoint,
    /scope:\s*Type\.Optional\([\s\S]*StringEnum\(\["all", "interactive", "landmarks", "headings", "forms", "images", "focusable", "viewport", "focused"\]/,
  );
});

test("chrome_cdp supports selector-targeted typing to avoid stale focus", () => {
  const entrypoint = readFileSync(extensionPath, "utf8");
  assert.match(entrypoint, /case "type":\s*\{[\s\S]*params\.selector/);
  assert.match(entrypoint, /buildFocusExpression\(/);
});

test("chrome_cdp click and type actions report post-action state details", () => {
  const entrypoint = readFileSync(extensionPath, "utf8");
  assert.match(entrypoint, /pageBefore/);
  assert.match(entrypoint, /pageAfter/);
  assert.match(entrypoint, /activeAfter/);
});


test("generated DOM helper expression is syntactically valid JavaScript", () => {
  const entrypoint = readFileSync(extensionPath, "utf8");
  const helpers = extractDomHelpersTemplate(entrypoint);
  const expression = `(() => {${helpers} return pageState(); })()`;
  assert.doesNotThrow(() => new Function(`return ${expression};`));
});


test("selector-targeted type clears existing field content before inserting text", () => {
  const entrypoint = readFileSync(extensionPath, "utf8");
  assert.match(entrypoint, /buildPrepareTypeExpression\(/);
  assert.match(entrypoint, /\.value = ""/);
  assert.match(entrypoint, /dispatchEvent\(new Event\("input"/);
});


test("chrome_cdp tool schema includes large-output guardrail controls", () => {
  const entrypoint = readFileSync(extensionPath, "utf8");
  assert.match(entrypoint, /allowLargeOutput:\s*Type\.Optional\(Type\.Boolean/);
  assert.match(entrypoint, /maxOutputChars:\s*Type\.Optional\(Type\.Number/);
});


test("snapshot details keep lightweight metadata by default and gate full payload behind opt-in", () => {
  const entrypoint = readFileSync(extensionPath, "utf8");
  assert.match(entrypoint, /includeStructuredDetails:\s*Type\.Optional\(Type\.Boolean/);
  assert.match(entrypoint, /snapshotMeta:\s*buildSnapshotMeta\(snapshot\)/);
  assert.match(entrypoint, /snapshot:\s*params\.includeStructuredDetails \? snapshot : undefined/);
});

test("snapshot defaults use json + interactive scope for safer context usage", () => {
  const entrypoint = readFileSync(extensionPath, "utf8");
  assert.match(entrypoint, /function normalizeSnapshotFormat[\s\S]*value === "text" \? "text" : "json"/);
  assert.match(entrypoint, /function normalizeSnapshotScope[\s\S]*: "interactive"/);
});

test("chrome_cdp output guardrail truncates oversized responses unless explicitly allowed", () => {
  const entrypoint = readFileSync(extensionPath, "utf8");
  assert.match(entrypoint, /function applyOutputGuardrail\(/);
  assert.match(entrypoint, /Output truncated from \$\{outputChars\} to \$\{outputLimit\} chars/);
  assert.match(entrypoint, /allowLargeOutput \|\| outputChars <= outputLimit/);
});


test("chrome_cdp schema supports snapshot item limit tuning", () => {
  const entrypoint = readFileSync(extensionPath, "utf8");
  assert.match(entrypoint, /itemLimit:\s*Type\.Optional\(Type\.Number/);
  assert.match(entrypoint, /function normalizeSnapshotItemLimit\(/);
});

test("chrome_cdp adds high-cost telemetry and warning fields", () => {
  const entrypoint = readFileSync(extensionPath, "utf8");
  assert.match(entrypoint, /function buildHighCostTelemetry\(/);
  assert.match(entrypoint, /function buildPreflightWarnings\(/);
  assert.match(entrypoint, /highCost:\s*telemetry/);
  assert.match(entrypoint, /warnings:\s*detailWarnings/);
});


test("chrome_cdp schema supports delta snapshots, html chunking, and budget warnings", () => {
  const entrypoint = readFileSync(extensionPath, "utf8");
  assert.match(entrypoint, /deltaKey:\s*Type\.Optional\(Type\.String/);
  assert.match(entrypoint, /htmlChunkStart:\s*Type\.Optional\(Type\.Number/);
  assert.match(entrypoint, /htmlChunkSize:\s*Type\.Optional\(Type\.Number/);
  assert.match(entrypoint, /budgetWarnChars:\s*Type\.Optional\(Type\.Number/);
});

test("chrome_cdp implements delta + html chunk + budget helpers", () => {
  const entrypoint = readFileSync(extensionPath, "utf8");
  assert.match(entrypoint, /function buildSnapshotDelta\(/);
  assert.match(entrypoint, /function chunkHtmlOutput\(/);
  assert.match(entrypoint, /function normalizeBudgetWarnChars\(/);
  assert.match(entrypoint, /applyBudget\(/);
});

test("tool prompt guidelines document progressive-scoped CDP usage", () => {
  const entrypoint = readFileSync(extensionPath, "utf8");
  assert.match(entrypoint, /Default to snapshot\(format:\\"json\\", scope:\\"interactive\\"/);
  assert.match(entrypoint, /Prefer selector-scoped actions over page-wide reads/);
  assert.match(entrypoint, /Large responses are truncated by default; set allowLargeOutput:true/);
});
