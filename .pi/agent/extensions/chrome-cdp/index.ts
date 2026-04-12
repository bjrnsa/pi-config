import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

const baseDir = dirname(fileURLToPath(import.meta.url));
const scriptPath = resolve(baseDir, "skills/chrome-cdp/scripts/cdp.mjs");
const targetStateType = "chrome-cdp-target";
const commandNames = [
  "list",
  "use",
  "clear",
  "snap",
  "shot",
  "html",
  "eval",
  "nav",
  "net",
  "click",
  "clickxy",
  "type",
  "loadall",
  "stop",
  "help",
] as const;
const chromeToolActions = [
  "list_tabs",
  "select_tab",
  "clear_tab",
  "snapshot",
  "audit_accessibility",
  "screenshot",
  "html",
  "evaluate",
  "navigate",
  "network",
  "click",
  "click_coordinates",
  "type",
  "load_all",
  "stop",
] as const;
const snapshotFormats = ["text", "json"] as const;
const snapshotScopes = ["all", "interactive", "landmarks", "headings", "forms", "images", "focusable", "viewport", "focused"] as const;
const defaultOutputCharLimit = 60_000;
const minimumOutputCharLimit = 2_000;
const maximumOutputCharLimit = 400_000;
const defaultBudgetWarnChars = 300_000;
const minimumHtmlChunkSize = 500;
const maximumHtmlChunkSize = 200_000;
const defaultSnapshotItemLimit = 150;
const minimumSnapshotItemLimit = 25;
const maximumSnapshotItemLimit = 1_000;

const chromeToolSchema = Type.Object({
  action: StringEnum(chromeToolActions),
  target: Type.Optional(
    Type.String({ description: "Chrome target prefix. Omit to use the remembered tab or auto-pick one." }),
  ),
  selector: Type.Optional(Type.String({ description: "CSS selector for click, html, load_all, type, or scoped snapshots." })),
  expression: Type.Optional(Type.String({ description: "JavaScript expression for evaluate." })),
  url: Type.Optional(Type.String({ description: "Destination URL for navigate." })),
  text: Type.Optional(Type.String({ description: "Text for type." })),
  file: Type.Optional(Type.String({ description: "Screenshot output path for screenshot." })),
  x: Type.Optional(Type.Number({ description: "CSS X coordinate for click_coordinates." })),
  y: Type.Optional(Type.Number({ description: "CSS Y coordinate for click_coordinates." })),
  intervalMs: Type.Optional(Type.Number({ description: "Delay between clicks for load_all." })),
  stopAll: Type.Optional(Type.Boolean({ description: "Stop all Chrome CDP daemons instead of one target." })),
  format: Type.Optional(StringEnum(["text", "json"] as const, { description: "Output format for snapshot and audit_accessibility: text or json." })),
  scope: Type.Optional(
    StringEnum(["all", "interactive", "landmarks", "headings", "forms", "images", "focusable", "viewport", "focused"] as const, {
      description: "Subset for snapshot and audit_accessibility: all, interactive, landmarks, headings, forms, images, focusable, viewport, or focused.",
    }),
  ),
  includeHidden: Type.Optional(Type.Boolean({ description: "Include hidden nodes in structured snapshot and audit output." })),
  includeIframes: Type.Optional(Type.Boolean({ description: "Include iframe elements in structured snapshot and audit output." })),
  allowLargeOutput: Type.Optional(Type.Boolean({ description: "Allow very large outputs (page-wide html, broad snapshots). Default false to protect context window." })),
  maxOutputChars: Type.Optional(Type.Number({ description: "Per-call output cap in characters when allowLargeOutput is false. Defaults to 60000; clamped to safe bounds." })),
  includeStructuredDetails: Type.Optional(Type.Boolean({ description: "Include full structured payloads (e.g. snapshot object) in tool details. Default false to reduce context usage." })),
  deltaKey: Type.Optional(Type.String({ description: "Delta cache key for snapshot/audit. When set, returns compact diff against previous call with same key+target." })),
  htmlChunkStart: Type.Optional(Type.Number({ description: "Start offset for chunked html output." })),
  htmlChunkSize: Type.Optional(Type.Number({ description: "Chunk size for html output. When set, html response is paged." })),
  budgetWarnChars: Type.Optional(Type.Number({ description: "Warn threshold for cumulative output chars per target in this session. Default 300000." })),
  itemLimit: Type.Optional(Type.Number({ description: "Max snapshot items to return for snapshot/audit. Defaults to 150; clamped to safe bounds." })),
});

type CommandName = (typeof commandNames)[number];
type ChromeToolAction = (typeof chromeToolActions)[number];
type SnapshotFormat = (typeof snapshotFormats)[number];
type SnapshotScope = (typeof snapshotScopes)[number];
type ChromeToolParams = {
  action: ChromeToolAction;
  target?: string;
  selector?: string;
  expression?: string;
  url?: string;
  text?: string;
  file?: string;
  x?: number;
  y?: number;
  intervalMs?: number;
  stopAll?: boolean;
  format?: string;
  scope?: string;
  includeHidden?: boolean;
  includeIframes?: boolean;
  allowLargeOutput?: boolean;
  maxOutputChars?: number;
  includeStructuredDetails?: boolean;
  deltaKey?: string;
  htmlChunkStart?: number;
  htmlChunkSize?: number;
  budgetWarnChars?: number;
  itemLimit?: number;
};
type Page = {
  prefix: string;
  title: string;
  url: string;
};
type InteractiveContext = ExtensionContext | ExtensionCommandContext;
type ElementSummary = {
  selector: string | null;
  tag: string;
  role: string | null;
  name: string | null;
  label: string | null;
  labelSource: string | null;
  text: string | null;
  value: string | null;
  type: string | null;
  href: string | null;
  alt: string | null;
  title: string | null;
  checked: boolean | null;
  selected: boolean | null;
  disabled: boolean;
  expanded: string | null;
  focused: boolean;
  focusable: boolean;
  visible: boolean;
  inViewport: boolean;
  interactive: boolean;
  landmark: boolean;
  formControl: boolean;
  level: number | null;
  placeholder: string | null;
};
type PageState = {
  title: string;
  url: string;
  hash: string;
  scrollX: number;
  scrollY: number;
  activeElement: ElementSummary | null;
};
type StructuredSnapshot = {
  page: PageState;
  selector: string | null;
  scope: SnapshotScope;
  includeHidden: boolean;
  includeIframes: boolean;
  counts: {
    total: number;
    interactive: number;
    headings: number;
    landmarks: number;
    formControls: number;
    images: number;
    focusable: number;
  };
  audit: {
    unlabeledControls: Array<Pick<ElementSummary, "selector" | "tag" | "role">>;
    unlabeledInputs: Array<Pick<ElementSummary, "selector" | "tag" | "role" | "labelSource" | "placeholder">>;
    genericNames: Array<Pick<ElementSummary, "selector" | "tag" | "role" | "name">>;
    duplicateNames: Array<{ name: string; count: number; selectors: string[] }>;
    missingAlt: Array<Pick<ElementSummary, "selector" | "tag" | "role">>;
  };
  items: ElementSummary[];
  truncated: boolean;
};
type ActionInspection = {
  ok: boolean;
  matched: ElementSummary | null;
  before: ElementSummary | null;
  after: ElementSummary | null;
  activeBefore: ElementSummary | null;
  activeAfter: ElementSummary | null;
  pageBefore: PageState;
  pageAfter: PageState;
  error?: string;
};
type FocusInspection = {
  ok: boolean;
  matched: ElementSummary | null;
  activeBefore: ElementSummary | null;
  activeAfter: ElementSummary | null;
  pageBefore: PageState;
  pageAfter: PageState;
  error?: string;
};

type SnapshotOptions = {
  selector?: string;
  scope: SnapshotScope;
  includeHidden: boolean;
  includeIframes: boolean;
  limit: number;
};

function parsePageList(output: string): Page[] {
  return output
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const [prefix = "", title = "", url = ""] = line.split(/\s{2,}/);
      return { prefix: prefix.trim(), title: title.trim(), url: url.trim() };
    })
    .filter((page) => page.prefix.length > 0);
}

function parseChromeArgs(rawArgs: string): { command: CommandName; args: string[] } | undefined {
  const trimmed = rawArgs.trim();
  if (!trimmed) {
    return { command: "help", args: [] };
  }

  const [command, ...rest] = trimmed.split(/\s+/);
  if (!commandNames.includes(command as CommandName)) {
    return undefined;
  }

  const remainder = trimmed.slice(command.length).trim();
  switch (command as CommandName) {
    case "eval":
    case "type":
      return { command, args: remainder ? [remainder] : [] };
    case "html":
    case "nav":
    case "click":
    case "use":
      return { command, args: remainder ? [remainder] : [] };
    case "clickxy": {
      const [x, y] = remainder.split(/\s+/, 2).filter(Boolean);
      return { command, args: [x, y].filter(Boolean) };
    }
    case "shot":
    case "stop": {
      const [first] = remainder.split(/\s+/, 1).filter(Boolean);
      return { command, args: first ? [first] : [] };
    }
    case "loadall": {
      const match = remainder.match(/^(.*?)(?:\s+(\d+))?$/);
      const selector = match?.[1]?.trim() ?? "";
      const interval = match?.[2]?.trim();
      return { command, args: [selector, interval].filter(Boolean) };
    }
    default:
      return { command, args: remainder ? remainder.split(/\s+/) : rest };
  }
}

function usageText(): string {
  return [
    "Chrome CDP slash commands",
    "",
    "/chrome-tabs               List open Chrome tabs and remember one for this session",
    "/chrome use <prefix>       Remember a target prefix from cdp list output",
    "/chrome clear              Forget the remembered tab",
    "/chrome snap               Accessibility snapshot for the remembered tab",
    "/chrome shot [file]        Screenshot the remembered tab",
    "/chrome html [selector]    Dump page HTML or one element",
    "/chrome eval <expr>        Evaluate JavaScript in the page",
    "/chrome nav <url>          Navigate the remembered tab",
    "/chrome net                Show resource timing entries",
    "/chrome click <selector>   Click an element by CSS selector",
    "/chrome clickxy <x> <y>    Click CSS pixel coordinates",
    "/chrome type <text>        Type into the current focus",
    "/chrome loadall <selector> [ms]  Click a load-more element until it disappears",
    "/chrome stop [target]      Stop the current daemon or all with: /chrome stop all",
    "",
    "Tip: if no tab is remembered yet, most /chrome commands will open a picker automatically.",
  ].join("\n");
}

function normalizeSnapshotFormat(value: string | undefined): SnapshotFormat {
  return value === "text" ? "text" : "json";
}

function normalizeSnapshotScope(value: string | undefined): SnapshotScope {
  return snapshotScopes.includes(value as SnapshotScope) ? (value as SnapshotScope) : "interactive";
}

function domHelpersSource(): string {
  return `
    const textOrNull = (value) => {
      if (value == null) return null;
      const text = String(value).replace(/\\s+/g, ' ').trim();
      return text === '' ? null : text;
    };
    const boolOrNull = (value) => value == null ? null : Boolean(value);
    const cssEscape = globalThis.CSS && typeof globalThis.CSS.escape === 'function'
      ? globalThis.CSS.escape.bind(globalThis.CSS)
      : (value) => String(value).replace(/[^a-zA-Z0-9_-]/g, '\\\\$&');
    const quoteAttr = (value) => String(value).replace(/\\\\/g, '\\\\\\\\').replace(/"/g, '\\\\"');
    const implicitRoleFor = (el) => {
      const tag = el.tagName.toLowerCase();
      const type = (el.getAttribute('type') || '').toLowerCase();
      if (/^h[1-6]$/.test(tag)) return 'heading';
      if (tag === 'a' && el.hasAttribute('href')) return 'link';
      if (tag === 'button') return 'button';
      if (tag === 'summary') return 'button';
      if (tag === 'textarea') return 'textbox';
      if (tag === 'select') return 'combobox';
      if (tag === 'img') return 'img';
      if (tag === 'main') return 'main';
      if (tag === 'nav') return 'navigation';
      if (tag === 'aside') return 'complementary';
      if (tag === 'footer') return 'contentinfo';
      if (tag === 'header') return 'banner';
      if (tag === 'form') return 'form';
      if (tag === 'input') {
        if (['button', 'submit', 'reset'].includes(type)) return 'button';
        if (type === 'checkbox') return 'checkbox';
        if (type === 'radio') return 'radio';
        if (type === 'range') return 'slider';
        if (type === 'search') return 'searchbox';
        if (['email', 'tel', 'text', 'url', 'password', 'number'].includes(type) || type === '') return 'textbox';
      }
      return null;
    };
    const labelFromIds = (el) => {
      const labelledBy = textOrNull(el.getAttribute('aria-labelledby'));
      if (!labelledBy) return { label: null, source: null };
      const label = textOrNull(labelledBy.split(/\\s+/).map((id) => document.getElementById(id)?.textContent || '').join(' '));
      return { label, source: label ? 'aria-labelledby' : null };
    };
    const labelFromLabelElement = (el) => {
      const labels = el.labels ? Array.from(el.labels) : [];
      if (labels.length === 0) return { label: null, source: null };
      return { label: textOrNull(labels.map((label) => label.textContent || '').join(' ')), source: 'label' };
    };
    const labelDetailsFor = (el) => {
      const labelledBy = labelFromIds(el);
      if (labelledBy.label) return labelledBy;
      const ariaLabel = textOrNull(el.getAttribute('aria-label'));
      if (ariaLabel) return { label: ariaLabel, source: 'aria-label' };
      if (el instanceof HTMLImageElement) {
        const alt = textOrNull(el.alt);
        if (alt) return { label: alt, source: 'alt' };
      }
      const explicitLabel = labelFromLabelElement(el);
      if (explicitLabel.label) return explicitLabel;
      if (el instanceof HTMLInputElement && ['button', 'submit', 'reset'].includes((el.type || '').toLowerCase())) {
        const value = textOrNull(el.value);
        if (value) return { label: value, source: 'value' };
      }
      const placeholder = textOrNull(el.getAttribute('placeholder'));
      if (placeholder) return { label: placeholder, source: 'placeholder' };
      const title = textOrNull(el.getAttribute('title'));
      if (title) return { label: title, source: 'title' };
      const text = textOrNull(el.textContent);
      if (text) return { label: text, source: 'text' };
      return { label: null, source: null };
    };
    const isVisible = (el) => {
      if (!(el instanceof Element)) return false;
      if (el.hidden || el.getAttribute('aria-hidden') === 'true') return false;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const isFocusable = (el) => {
      const tabIndex = el.tabIndex;
      const tag = el.tagName.toLowerCase();
      if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') return false;
      if (tabIndex >= 0) return true;
      if (tag === 'a' && el.hasAttribute('href')) return true;
      if (['button', 'input', 'select', 'textarea', 'summary'].includes(tag)) return true;
      return el.hasAttribute('contenteditable');
    };
    const selectorFor = (el) => {
      if (!(el instanceof Element)) return null;
      if (el.id) return '#' + cssEscape(el.id);
      const tag = el.tagName.toLowerCase();
      const name = textOrNull(el.getAttribute('name'));
      if (name) return tag + '[name="' + quoteAttr(name) + '"]';
      const ariaLabel = textOrNull(el.getAttribute('aria-label'));
      if (ariaLabel) return tag + '[aria-label="' + quoteAttr(ariaLabel) + '"]';
      const href = textOrNull(el.getAttribute('href'));
      if (href) return tag + '[href="' + quoteAttr(href) + '"]';
      const dataItem = textOrNull(el.getAttribute('data-item'));
      if (dataItem) return tag + '[data-item="' + quoteAttr(dataItem) + '"]';
      return tag;
    };
    const describeElement = (node) => {
      if (!(node instanceof Element)) return null;
      const role = textOrNull(node.getAttribute('role')) || implicitRoleFor(node);
      const labelDetails = labelDetailsFor(node);
      const rect = node.getBoundingClientRect();
      const level = /^h[1-6]$/i.test(node.tagName) ? Number(node.tagName.slice(1)) : null;
      const checked = node.getAttribute('aria-checked') != null
        ? node.getAttribute('aria-checked') === 'true'
        : ('checked' in node ? boolOrNull(node.checked) : null);
      const selected = node.getAttribute('aria-selected') != null
        ? node.getAttribute('aria-selected') === 'true'
        : ('selected' in node ? boolOrNull(node.selected) : null);
      const expanded = textOrNull(node.getAttribute('aria-expanded'));
      const value = 'value' in node ? textOrNull(node.value) : null;
      const tag = node.tagName.toLowerCase();
      const landmarkRoles = new Set(['banner', 'complementary', 'contentinfo', 'form', 'main', 'navigation', 'region', 'search']);
      const formControl = ['input', 'select', 'textarea', 'button'].includes(tag) || ['textbox', 'checkbox', 'radio', 'combobox', 'switch', 'slider'].includes(role || '');
      const interactive = isFocusable(node) || ['button', 'checkbox', 'combobox', 'link', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'radio', 'searchbox', 'slider', 'switch', 'tab', 'textbox'].includes(role || '');
      return {
        selector: selectorFor(node),
        tag,
        role,
        name: labelDetails.label,
        label: labelDetails.label,
        labelSource: labelDetails.source,
        text: textOrNull(node.textContent),
        value,
        type: textOrNull(node.getAttribute('type')),
        href: textOrNull(node.getAttribute('href')),
        alt: textOrNull(node.getAttribute('alt')),
        title: textOrNull(node.getAttribute('title')),
        checked,
        selected,
        disabled: node.matches(':disabled') || node.getAttribute('aria-disabled') === 'true',
        expanded,
        focused: document.activeElement === node,
        focusable: isFocusable(node),
        visible: isVisible(node),
        inViewport: rect.bottom >= 0 && rect.right >= 0 && rect.top <= window.innerHeight && rect.left <= window.innerWidth,
        interactive,
        landmark: landmarkRoles.has(role || ''),
        formControl,
        level,
        placeholder: textOrNull(node.getAttribute('placeholder')),
      };
    };
    const pageState = () => ({
      title: document.title,
      url: location.href,
      hash: location.hash,
      scrollX: Math.round(window.scrollX),
      scrollY: Math.round(window.scrollY),
      activeElement: describeElement(document.activeElement),
    });
  `;
}

function buildSnapshotExpression(options: SnapshotOptions): string {
  return `
    (() => {
      const config = ${JSON.stringify(options)};
      ${domHelpersSource()}
      const genericNames = new Set(['button', 'link', 'image', 'graphic', 'icon', 'menu', 'more', 'open', 'close', 'toggle']);
      const roots = config.selector
        ? Array.from(document.querySelectorAll(config.selector))
        : [document.documentElement];
      if (config.selector && roots.length === 0) {
        return {
          page: pageState(),
          selector: config.selector,
          scope: config.scope,
          includeHidden: config.includeHidden,
          includeIframes: config.includeIframes,
          counts: { total: 0, interactive: 0, headings: 0, landmarks: 0, formControls: 0, images: 0, focusable: 0 },
          audit: { unlabeledControls: [], unlabeledInputs: [], genericNames: [], duplicateNames: [], missingAlt: [] },
          items: [],
          truncated: false,
        };
      }
      const items = [];
      const seen = new Set();
      const matchesScope = (item) => {
        switch (config.scope) {
          case 'interactive': return item.interactive;
          case 'landmarks': return item.landmark;
          case 'headings': return item.level != null || item.role === 'heading';
          case 'forms': return item.formControl || item.tag === 'form';
          case 'images': return item.tag === 'img' || item.role === 'img';
          case 'focusable': return item.focusable;
          case 'viewport': return item.inViewport;
          case 'focused': return item.focused;
          case 'all':
          default:
            return item.interactive || item.landmark || item.formControl || item.tag === 'img' || item.level != null || item.focusable || item.focused;
        }
      };
      for (const root of roots) {
        const elements = root instanceof Element ? [root, ...root.querySelectorAll('*')] : [];
        for (const element of elements) {
          if (!(element instanceof Element)) continue;
          if (!config.includeIframes && element.tagName.toLowerCase() === 'iframe') continue;
          if (seen.has(element)) continue;
          seen.add(element);
          const item = describeElement(element);
          if (!item) continue;
          if (!config.includeHidden && !item.visible) continue;
          if (!matchesScope(item)) continue;
          items.push(item);
        }
      }
      const nameMap = new Map();
      for (const item of items) {
        const key = item.interactive && item.name ? item.name.toLowerCase() : null;
        if (!key) continue;
        const record = nameMap.get(key) || { name: item.name, count: 0, selectors: [] };
        record.count += 1;
        if (item.selector) record.selectors.push(item.selector);
        nameMap.set(key, record);
      }
      const audit = {
        unlabeledControls: items
          .filter((item) => item.interactive && !item.name && item.tag !== 'input')
          .slice(0, 25)
          .map((item) => ({ selector: item.selector, tag: item.tag, role: item.role })),
        unlabeledInputs: items
          .filter((item) => item.formControl && item.tag !== 'button' && !item.name && item.type !== 'hidden')
          .slice(0, 25)
          .map((item) => ({
            selector: item.selector,
            tag: item.tag,
            role: item.role,
            labelSource: item.labelSource,
            placeholder: item.placeholder,
          })),
        genericNames: items
          .filter((item) => item.interactive && item.name && genericNames.has(item.name.toLowerCase()))
          .slice(0, 25)
          .map((item) => ({ selector: item.selector, tag: item.tag, role: item.role, name: item.name })),
        duplicateNames: [...nameMap.values()]
          .filter((entry) => entry.count > 1)
          .sort((left, right) => right.count - left.count)
          .slice(0, 25),
        missingAlt: items
          .filter((item) => item.tag === 'img' && !item.alt)
          .slice(0, 25)
          .map((item) => ({ selector: item.selector, tag: item.tag, role: item.role })),
      };
      return {
        page: pageState(),
        selector: config.selector || null,
        scope: config.scope,
        includeHidden: config.includeHidden,
        includeIframes: config.includeIframes,
        counts: {
          total: items.length,
          interactive: items.filter((item) => item.interactive).length,
          headings: items.filter((item) => item.level != null || item.role === 'heading').length,
          landmarks: items.filter((item) => item.landmark).length,
          formControls: items.filter((item) => item.formControl).length,
          images: items.filter((item) => item.tag === 'img' || item.role === 'img').length,
          focusable: items.filter((item) => item.focusable).length,
        },
        audit,
        items: items.slice(0, config.limit),
        truncated: items.length > config.limit,
      };
    })()
  `;
}

function buildFocusExpression(selector: string): string {
  return `
    (() => {
      const selector = ${JSON.stringify(selector)};
      ${domHelpersSource()}
      const element = document.querySelector(selector);
      if (!(element instanceof Element)) {
        return { ok: false, error: 'Element not found: ' + selector, matched: null, activeBefore: pageState().activeElement, activeAfter: pageState().activeElement, pageBefore: pageState(), pageAfter: pageState() };
      }
      const beforePage = pageState();
      element.scrollIntoView({ block: 'center', inline: 'center' });
      if (element instanceof HTMLElement) {
        element.focus({ preventScroll: true });
      }
      return {
        ok: true,
        matched: describeElement(element),
        activeBefore: beforePage.activeElement,
        activeAfter: describeElement(document.activeElement),
        pageBefore: beforePage,
        pageAfter: pageState(),
      };
    })()
  `;
}

function buildPrepareTypeExpression(selector: string): string {
  return `
    (() => {
      const selector = ${JSON.stringify(selector)};
      ${domHelpersSource()}
      const element = document.querySelector(selector);
      if (!(element instanceof Element)) {
        return { ok: false, error: 'Element not found: ' + selector, matched: null, activeBefore: pageState().activeElement, activeAfter: pageState().activeElement, pageBefore: pageState(), pageAfter: pageState() };
      }
      const pageBefore = pageState();
      element.scrollIntoView({ block: 'center', inline: 'center' });
      if (element instanceof HTMLElement) {
        element.focus({ preventScroll: true });
      }
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        element.value = "";
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
      } else if (element instanceof HTMLElement && element.isContentEditable) {
        element.textContent = "";
        element.dispatchEvent(new Event("input", { bubbles: true }));
      }
      return {
        ok: true,
        matched: describeElement(element),
        activeBefore: pageBefore.activeElement,
        activeAfter: describeElement(document.activeElement),
        pageBefore,
        pageAfter: pageState(),
      };
    })()
  `;
}

function buildInspectExpression(selector: string): string {
  return `
    (() => {
      const selector = ${JSON.stringify(selector)};
      ${domHelpersSource()}
      return {
        ok: true,
        matched: describeElement(document.querySelector(selector)),
        activeBefore: pageState().activeElement,
        activeAfter: pageState().activeElement,
        pageBefore: pageState(),
        pageAfter: pageState(),
      };
    })()
  `;
}

function buildClickExpression(selector: string): string {
  return `
    (() => {
      const selector = ${JSON.stringify(selector)};
      ${domHelpersSource()}
      const element = document.querySelector(selector);
      if (!(element instanceof Element)) {
        return {
          ok: false,
          error: 'Element not found: ' + selector,
          matched: null,
          before: null,
          after: null,
          activeBefore: pageState().activeElement,
          activeAfter: pageState().activeElement,
          pageBefore: pageState(),
          pageAfter: pageState(),
        };
      }
      const pageBefore = pageState();
      const before = describeElement(element);
      element.scrollIntoView({ block: 'center', inline: 'center' });
      if (element instanceof HTMLElement) {
        element.focus({ preventScroll: true });
      }
      element.click();
      return {
        ok: true,
        matched: describeElement(element),
        before,
        after: describeElement(element),
        activeBefore: pageBefore.activeElement,
        activeAfter: describeElement(document.activeElement),
        pageBefore,
        pageAfter: pageState(),
      };
    })()
  `;
}

function parseJsonResult<T>(output: string, label: string): T {
  try {
    return JSON.parse(output) as T;
  } catch (error) {
    throw new Error(`chrome_cdp ${label} returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function normalizeOutputLimit(requestedLimit: number | undefined): number {
  if (typeof requestedLimit !== "number" || Number.isNaN(requestedLimit)) {
    return defaultOutputCharLimit;
  }
  const rounded = Math.floor(requestedLimit);
  if (rounded < minimumOutputCharLimit) return minimumOutputCharLimit;
  if (rounded > maximumOutputCharLimit) return maximumOutputCharLimit;
  return rounded;
}

function normalizeSnapshotItemLimit(requestedLimit: number | undefined): number {
  if (typeof requestedLimit !== "number" || Number.isNaN(requestedLimit)) {
    return defaultSnapshotItemLimit;
  }
  const rounded = Math.floor(requestedLimit);
  if (rounded < minimumSnapshotItemLimit) return minimumSnapshotItemLimit;
  if (rounded > maximumSnapshotItemLimit) return maximumSnapshotItemLimit;
  return rounded;
}

type HighCostTelemetry = {
  count: number;
  flags: string[];
  pageWideHtml: boolean;
  broadScopeSnapshot: boolean;
  includeHidden: boolean;
  includeIframes: boolean;
};

function buildHighCostTelemetry(params: ChromeToolParams): HighCostTelemetry {
  const hasSelector = Boolean(params.selector?.trim());
  const action = params.action;
  const pageWideHtml = action === "html" && !hasSelector;
  const broadScopeSnapshot =
    (action === "snapshot" || action === "audit_accessibility") && normalizeSnapshotScope(params.scope) === "all" && !hasSelector;
  const includeHidden = params.includeHidden === true;
  const includeIframes = params.includeIframes === true;
  const flags = [
    pageWideHtml ? "page_wide_html" : undefined,
    broadScopeSnapshot ? "broad_scope_snapshot" : undefined,
    includeHidden ? "include_hidden" : undefined,
    includeIframes ? "include_iframes" : undefined,
  ].filter((flag): flag is string => Boolean(flag));
  return {
    count: flags.length,
    flags,
    pageWideHtml,
    broadScopeSnapshot,
    includeHidden,
    includeIframes,
  };
}

function buildPreflightWarnings(params: ChromeToolParams, telemetry: HighCostTelemetry): string[] {
  const warnings: string[] = [];
  if (telemetry.pageWideHtml) {
    warnings.push("High-cost call: page-wide html can be very large. Prefer selector-scoped html when possible.");
  }
  if (telemetry.broadScopeSnapshot) {
    warnings.push('High-cost call: scope:"all" snapshot without selector can be very large. Prefer scoped snapshot first.');
  }
  if (telemetry.includeHidden) {
    warnings.push("High-cost call: includeHidden:true increases snapshot size substantially.");
  }
  if (telemetry.includeIframes) {
    warnings.push("High-cost call: includeIframes:true can expand output across embedded documents.");
  }
  if (params.allowLargeOutput === true && telemetry.count > 0) {
    warnings.push("allowLargeOutput:true with high-cost options may exceed context budget quickly.");
  }
  return warnings;
}

function normalizeBudgetWarnChars(requested: number | undefined): number {
  if (typeof requested !== "number" || Number.isNaN(requested) || requested <= 0) {
    return defaultBudgetWarnChars;
  }
  return Math.floor(requested);
}

function normalizeHtmlChunkStart(requested: number | undefined): number {
  if (typeof requested !== "number" || Number.isNaN(requested)) return 0;
  return Math.max(0, Math.floor(requested));
}

function normalizeHtmlChunkSize(requested: number | undefined): number | undefined {
  if (typeof requested !== "number" || Number.isNaN(requested)) return undefined;
  const rounded = Math.floor(requested);
  if (rounded < minimumHtmlChunkSize) return minimumHtmlChunkSize;
  if (rounded > maximumHtmlChunkSize) return maximumHtmlChunkSize;
  return rounded;
}

function chunkHtmlOutput(output: string, start: number, size: number): { text: string; start: number; size: number; end: number; total: number; hasMore: boolean; nextStart: number | null } {
  const safeStart = Math.min(start, output.length);
  const end = Math.min(safeStart + size, output.length);
  return {
    text: output.slice(safeStart, end),
    start: safeStart,
    size,
    end,
    total: output.length,
    hasMore: end < output.length,
    nextStart: end < output.length ? end : null,
  };
}

function snapshotItemSignature(item: ElementSummary): string {
  return [
    item.selector ?? "",
    item.tag,
    item.role ?? "",
    item.name ?? "",
    item.value ?? "",
    item.focused ? "1" : "0",
    item.checked == null ? "" : String(item.checked),
    item.selected == null ? "" : String(item.selected),
    item.disabled ? "1" : "0",
    item.expanded ?? "",
  ].join("|");
}

function buildSnapshotDelta(snapshot: StructuredSnapshot, previous: Set<string> | undefined): {
  mode: "delta";
  baseline: boolean;
  addedCount: number;
  removedCount: number;
  unchangedCount: number;
  changed: boolean;
  added: string[];
  removed: string[];
} {
  const current = new Set(snapshot.items.map(snapshotItemSignature));
  if (!previous) {
    return {
      mode: "delta",
      baseline: true,
      addedCount: current.size,
      removedCount: 0,
      unchangedCount: 0,
      changed: true,
      added: [...current].slice(0, 100),
      removed: [],
    };
  }
  const added = [...current].filter((entry) => !previous.has(entry));
  const removed = [...previous].filter((entry) => !current.has(entry));
  const unchangedCount = [...current].filter((entry) => previous.has(entry)).length;
  return {
    mode: "delta",
    baseline: false,
    addedCount: added.length,
    removedCount: removed.length,
    unchangedCount,
    changed: added.length > 0 || removed.length > 0,
    added: added.slice(0, 100),
    removed: removed.slice(0, 100),
  };
}

function applyOutputGuardrail(text: string, params: ChromeToolParams): { text: string; truncated: boolean; outputChars: number; outputLimit: number } {
  const outputChars = text.length;
  const outputLimit = normalizeOutputLimit(params.maxOutputChars);
  if (params.allowLargeOutput || outputChars <= outputLimit) {
    return { text, truncated: false, outputChars, outputLimit };
  }
  const suffix = `\n\n[chrome_cdp guardrail] Output truncated from ${outputChars} to ${outputLimit} chars. Re-run with allowLargeOutput:true for full output, or narrow selector/scope.`;
  return {
    text: `${text.slice(0, outputLimit)}${suffix}`,
    truncated: true,
    outputChars,
    outputLimit,
  };
}

function buildSnapshotMeta(snapshot: StructuredSnapshot): Record<string, unknown> {
  return {
    page: {
      title: snapshot.page.title,
      url: snapshot.page.url,
      hash: snapshot.page.hash,
      scrollX: snapshot.page.scrollX,
      scrollY: snapshot.page.scrollY,
      activeElement: snapshot.page.activeElement
        ? {
            selector: snapshot.page.activeElement.selector,
            tag: snapshot.page.activeElement.tag,
            role: snapshot.page.activeElement.role,
            name: snapshot.page.activeElement.name,
          }
        : null,
    },
    selector: snapshot.selector,
    scope: snapshot.scope,
    includeHidden: snapshot.includeHidden,
    includeIframes: snapshot.includeIframes,
    counts: snapshot.counts,
    auditCounts: {
      unlabeledControls: snapshot.audit.unlabeledControls.length,
      unlabeledInputs: snapshot.audit.unlabeledInputs.length,
      genericNames: snapshot.audit.genericNames.length,
      duplicateNames: snapshot.audit.duplicateNames.length,
      missingAlt: snapshot.audit.missingAlt.length,
    },
    itemCount: snapshot.items.length,
    itemsTruncated: snapshot.truncated,
  };
}

function summarizeElement(element: ElementSummary | null | undefined): string {
  if (!element) return "unknown element";
  const kind = element.role ?? element.tag;
  const name = element.name ?? element.selector ?? element.tag;
  return `${kind} ${JSON.stringify(name)}`;
}

function summarizePageDelta(before: PageState, after: PageState): string[] {
  const deltas: string[] = [];
  if (before.hash !== after.hash) deltas.push(`hash ${before.hash || "<empty>"} -> ${after.hash || "<empty>"}`);
  if (before.scrollY !== after.scrollY) deltas.push(`scrollY ${before.scrollY} -> ${after.scrollY}`);
  if (before.activeElement?.selector !== after.activeElement?.selector) {
    deltas.push(`focus ${before.activeElement?.selector ?? "<none>"} -> ${after.activeElement?.selector ?? "<none>"}`);
  }
  return deltas;
}

function renderSnapshotSummary(snapshot: StructuredSnapshot): string {
  const lines = [
    `Accessibility snapshot (${snapshot.scope})`,
    `Page: ${snapshot.page.title}`,
    `Counts: total=${snapshot.counts.total}, interactive=${snapshot.counts.interactive}, headings=${snapshot.counts.headings}, landmarks=${snapshot.counts.landmarks}, forms=${snapshot.counts.formControls}, images=${snapshot.counts.images}, focusable=${snapshot.counts.focusable}`,
    `Audit: unlabeled_controls=${snapshot.audit.unlabeledControls.length}, unlabeled_inputs=${snapshot.audit.unlabeledInputs.length}, generic_names=${snapshot.audit.genericNames.length}, duplicate_names=${snapshot.audit.duplicateNames.length}, missing_alt=${snapshot.audit.missingAlt.length}`,
  ];
  if (snapshot.selector) lines.push(`Selector: ${snapshot.selector}`);
  if (snapshot.page.activeElement) lines.push(`Active element: ${summarizeElement(snapshot.page.activeElement)}`);
  lines.push("");
  for (const item of snapshot.items.slice(0, 40)) {
    const parts = [
      item.selector ?? item.tag,
      item.role ?? item.tag,
      item.name ?? "",
      item.focused ? "focused" : "",
      item.disabled ? "disabled" : "",
      item.expanded ? `expanded=${item.expanded}` : "",
      item.checked == null ? "" : `checked=${item.checked}`,
      item.selected == null ? "" : `selected=${item.selected}`,
    ].filter(Boolean);
    lines.push(`- ${parts.join(" | ")}`);
  }
  if (snapshot.truncated) lines.push("... truncated");
  return lines.join("\n");
}

function renderAuditSummary(snapshot: StructuredSnapshot): string {
  const lines = [
    `Accessibility audit (${snapshot.scope})`,
    `Page: ${snapshot.page.title}`,
    `Unlabeled controls: ${snapshot.audit.unlabeledControls.length}`,
    `Unlabeled inputs: ${snapshot.audit.unlabeledInputs.length}`,
    `Generic names: ${snapshot.audit.genericNames.length}`,
    `Duplicate names: ${snapshot.audit.duplicateNames.length}`,
    `Missing alt: ${snapshot.audit.missingAlt.length}`,
  ];
  const topDuplicates = snapshot.audit.duplicateNames.slice(0, 5);
  if (topDuplicates.length > 0) {
    lines.push("Top duplicate names:");
    for (const duplicate of topDuplicates) {
      lines.push(`- ${duplicate.name}: ${duplicate.count}`);
    }
  }
  return lines.join("\n");
}

export default function chromeCdpExtension(pi: ExtensionAPI) {
  let selectedTarget: string | undefined;
  const snapshotDeltaCache = new Map<string, Set<string>>();
  const outputBudgetByTarget = new Map<string, { chars: number; calls: number; highCostCalls: number }>();

  const applyBudget = (target: string | undefined, outputChars: number, highCostCount: number, requestedWarn: number | undefined) => {
    if (!target) {
      return undefined;
    }
    const prior = outputBudgetByTarget.get(target) ?? { chars: 0, calls: 0, highCostCalls: 0 };
    const next = {
      chars: prior.chars + outputChars,
      calls: prior.calls + 1,
      highCostCalls: prior.highCostCalls + (highCostCount > 0 ? 1 : 0),
    };
    outputBudgetByTarget.set(target, next);
    const warnChars = normalizeBudgetWarnChars(requestedWarn);
    return {
      ...next,
      warnChars,
      exceededWarn: next.chars >= warnChars,
    };
  };

  pi.on("resources_discover", () => ({
    skillPaths: [join(baseDir, "skills")],
  }));

  const setSelectedTarget = (target: string | undefined) => {
    selectedTarget = target?.trim() || undefined;
    pi.appendEntry(targetStateType, { target: selectedTarget ?? null });
  };

  const runChrome = async (command: string, args: string[] = []) => {
    const result = await pi.exec(process.execPath, [scriptPath, command, ...args], { timeout: 35_000 });
    if (result.code !== 0) {
      const errorText = (result.stderr || result.stdout || `chrome-cdp command failed: ${command}`).trim();
      throw new Error(errorText);
    }
    return (result.stdout || result.stderr || "").trim();
  };

  const runChromeJson = async <T,>(target: string, expression: string, label: string) => {
    const output = await runChrome("eval", [target, expression]);
    return parseJsonResult<T>(output, label);
  };

  const listTabs = async () => {
    const output = await runChrome("list");
    return { output, pages: parsePageList(output) };
  };

  const chooseTarget = async (ctx: InteractiveContext, pages?: Page[]) => {
    const availablePages = pages ?? (await listTabs()).pages;
    if (availablePages.length === 0) {
      ctx.ui.notify("No debuggable Chrome tabs found", "warning");
      return undefined;
    }
    if (!ctx.hasUI) {
      throw new Error("chrome tab selection requires interactive mode");
    }
    const choice = await ctx.ui.select(
      "Pick a Chrome tab",
      availablePages.map((page) => `${page.prefix}  ${page.title}  ${page.url}`),
    );
    if (!choice) {
      ctx.ui.notify("Chrome tab selection cancelled", "info");
      return undefined;
    }
    const page = availablePages.find((candidate) => choice.startsWith(candidate.prefix));
    if (!page) {
      throw new Error(`Could not resolve selected tab: ${choice}`);
    }
    setSelectedTarget(page.prefix);
    ctx.ui.notify(`Using Chrome tab ${page.prefix}`, "info");
    return page.prefix;
  };

  const ensureTarget = async (ctx: InteractiveContext, requestedTarget?: string) => {
    const trimmedTarget = requestedTarget?.trim();
    if (trimmedTarget) {
      setSelectedTarget(trimmedTarget);
      return trimmedTarget;
    }
    if (selectedTarget) {
      return selectedTarget;
    }

    const { pages } = await listTabs();
    if (pages.length === 0) {
      throw new Error("No debuggable Chrome tabs found");
    }
    if (pages.length === 1) {
      setSelectedTarget(pages[0].prefix);
      return pages[0].prefix;
    }
    return chooseTarget(ctx, pages);
  };

  const runSnapshot = async (ctx: InteractiveContext, params: ChromeToolParams) => {
    const target = await ensureTarget(ctx, params.target);
    if (!target) {
      return {
        content: [{ type: "text" as const, text: "Chrome tab selection cancelled" }],
        details: { action: params.action, cancelled: true },
      };
    }
    const telemetry = buildHighCostTelemetry(params);
    const warnings = buildPreflightWarnings(params, telemetry);
    if (format === "text") {
      const output = await runChrome("snap", [target]);
      const guarded = applyOutputGuardrail(output, params);
      const budget = applyBudget(target, guarded.outputChars, telemetry.count, params.budgetWarnChars);
      const detailWarnings = [...warnings];
      if (budget?.exceededWarn) {
        detailWarnings.push(`Session output budget exceeded for ${target}: ${budget.chars}/${budget.warnChars} chars.`);
      }
      return {
        content: [{ type: "text" as const, text: guarded.text }],
        details: {
          action: params.action,
          target,
          format,
          outputChars: guarded.outputChars,
          outputLimit: guarded.outputLimit,
          truncated: guarded.truncated,
          allowLargeOutput: params.allowLargeOutput ?? false,
          includeStructuredDetails: params.includeStructuredDetails ?? false,
          itemLimit: normalizeSnapshotItemLimit(params.itemLimit),
          highCost: telemetry,
          warnings: detailWarnings,
          budget,
        },
      };
    }
    const snapshot = await runChromeJson<StructuredSnapshot>(
      target,
      buildSnapshotExpression({
        selector: params.selector,
        scope: normalizeSnapshotScope(params.scope),
        includeHidden: params.includeHidden ?? false,
        includeIframes: params.includeIframes ?? false,
        limit: normalizeSnapshotItemLimit(params.itemLimit),
      }),
      "snapshot",
    );

    const deltaCacheKey = params.deltaKey?.trim() ? `${target}|snapshot|${params.deltaKey.trim()}` : undefined;
    const previousDelta = deltaCacheKey ? snapshotDeltaCache.get(deltaCacheKey) : undefined;
    const delta = deltaCacheKey ? buildSnapshotDelta(snapshot, previousDelta) : undefined;
    if (deltaCacheKey) {
      snapshotDeltaCache.set(deltaCacheKey, new Set(snapshot.items.map(snapshotItemSignature)));
    }

    const payload = delta
      ? JSON.stringify({ mode: "delta", deltaKey: params.deltaKey, snapshotMeta: buildSnapshotMeta(snapshot), delta }, null, 2)
      : JSON.stringify(snapshot, null, 2);
    const guarded = applyOutputGuardrail(payload, params);
    const budget = applyBudget(target, guarded.outputChars, telemetry.count, params.budgetWarnChars);
    const detailWarnings = [...warnings];
    if (budget?.exceededWarn) {
      detailWarnings.push(`Session output budget exceeded for ${target}: ${budget.chars}/${budget.warnChars} chars.`);
    }
    return {
      content: [{ type: "text" as const, text: guarded.text }],
      details: {
        action: params.action,
        target,
        format,
        snapshot: params.includeStructuredDetails ? snapshot : undefined,
        snapshotMeta: buildSnapshotMeta(snapshot),
        delta,
        deltaKey: params.deltaKey,
        outputChars: guarded.outputChars,
        outputLimit: guarded.outputLimit,
        truncated: guarded.truncated,
        allowLargeOutput: params.allowLargeOutput ?? false,
        includeStructuredDetails: params.includeStructuredDetails ?? false,
        itemLimit: normalizeSnapshotItemLimit(params.itemLimit),
        highCost: telemetry,
        warnings: detailWarnings,
        budget,
      },
    };
  };

  const runAccessibilityAudit = async (ctx: InteractiveContext, params: ChromeToolParams) => {
    const target = await ensureTarget(ctx, params.target);
    if (!target) {
      return {
        content: [{ type: "text" as const, text: "Chrome tab selection cancelled" }],
        details: { action: params.action, cancelled: true },
      };
    }
    const telemetry = buildHighCostTelemetry(params);
    const warnings = buildPreflightWarnings(params, telemetry);
    const snapshot = await runChromeJson<StructuredSnapshot>(
      target,
      buildSnapshotExpression({
        selector: params.selector,
        scope: normalizeSnapshotScope(params.scope),
        includeHidden: params.includeHidden ?? false,
        includeIframes: params.includeIframes ?? false,
        limit: normalizeSnapshotItemLimit(params.itemLimit),
      }),
      "audit_accessibility",
    );

    const deltaCacheKey = params.deltaKey?.trim() ? `${target}|audit_accessibility|${params.deltaKey.trim()}` : undefined;
    const previousDelta = deltaCacheKey ? snapshotDeltaCache.get(deltaCacheKey) : undefined;
    const delta = deltaCacheKey ? buildSnapshotDelta(snapshot, previousDelta) : undefined;
    if (deltaCacheKey) {
      snapshotDeltaCache.set(deltaCacheKey, new Set(snapshot.items.map(snapshotItemSignature)));
    }
    const format = normalizeSnapshotFormat(params.format);
    const payload = delta
      ? JSON.stringify({ mode: "delta", deltaKey: params.deltaKey, snapshotMeta: buildSnapshotMeta(snapshot), delta }, null, 2)
      : format === "json"
        ? JSON.stringify(snapshot, null, 2)
        : renderAuditSummary(snapshot);
    const guarded = applyOutputGuardrail(payload, params);
    const budget = applyBudget(target, guarded.outputChars, telemetry.count, params.budgetWarnChars);
    const detailWarnings = [...warnings];
    if (budget?.exceededWarn) {
      detailWarnings.push(`Session output budget exceeded for ${target}: ${budget.chars}/${budget.warnChars} chars.`);
    }
    return {
      content: [{ type: "text" as const, text: guarded.text }],
      details: {
        action: params.action,
        target,
        format,
        snapshot: params.includeStructuredDetails ? snapshot : undefined,
        snapshotMeta: buildSnapshotMeta(snapshot),
        delta,
        deltaKey: params.deltaKey,
        outputChars: guarded.outputChars,
        outputLimit: guarded.outputLimit,
        truncated: guarded.truncated,
        allowLargeOutput: params.allowLargeOutput ?? false,
        includeStructuredDetails: params.includeStructuredDetails ?? false,
        itemLimit: normalizeSnapshotItemLimit(params.itemLimit),
        highCost: telemetry,
        warnings: detailWarnings,
        budget,
      },
    };
  };

  const runToolAction = async (ctx: InteractiveContext, params: ChromeToolParams) => {
    const telemetry = buildHighCostTelemetry(params);
    const warnings = buildPreflightWarnings(params, telemetry);
    const response = (text: string, details: Record<string, unknown> = {}) => {
      const guarded = applyOutputGuardrail(text, params);
      const detailTarget = typeof details.target === "string" ? details.target : params.target?.trim() || selectedTarget;
      const budget = applyBudget(detailTarget, guarded.outputChars, telemetry.count, params.budgetWarnChars);
      const detailWarnings = [...warnings];
      if (budget?.exceededWarn && detailTarget) {
        detailWarnings.push(`Session output budget exceeded for ${detailTarget}: ${budget.chars}/${budget.warnChars} chars.`);
      }
      return {
        content: [{ type: "text" as const, text: guarded.text }],
        details: {
          ...details,
          outputChars: guarded.outputChars,
          outputLimit: guarded.outputLimit,
          truncated: guarded.truncated,
          allowLargeOutput: params.allowLargeOutput ?? false,
          includeStructuredDetails: params.includeStructuredDetails ?? false,
          highCost: telemetry,
          warnings: detailWarnings,
          budget,
        },
      };
    };

    switch (params.action) {
      case "list_tabs": {
        const { pages } = await listTabs();
        const lines = pages.map((page) => {
          const prefix = page.prefix === selectedTarget ? `* ${page.prefix}` : `  ${page.prefix}`;
          return `${prefix}  ${page.title}  ${page.url}`;
        });
        return response(lines.join("\n") || "No debuggable Chrome tabs found", {
          action: params.action,
          selectedTarget: selectedTarget ?? null,
          pages,
        });
      }
      case "select_tab": {
        const target = params.target?.trim() ? await ensureTarget(ctx, params.target) : await chooseTarget(ctx);
        if (!target) {
          return response("Chrome tab selection cancelled", { action: params.action, cancelled: true });
        }
        return response(`Using Chrome tab ${target}`, { action: params.action, target });
      }
      case "clear_tab": {
        setSelectedTarget(undefined);
        return response("Cleared remembered Chrome tab", { action: params.action });
      }
      case "snapshot": {
        const result = await runSnapshot(ctx, params);
        if (params.format === "json") {
          return result;
        }
        const snapshot = result.details.snapshot as StructuredSnapshot | undefined;
        if (snapshot) {
          return response(renderSnapshotSummary(snapshot), {
            ...result.details,
            snapshot: params.includeStructuredDetails ? snapshot : undefined,
            snapshotMeta: buildSnapshotMeta(snapshot),
          });
        }
        return result;
      }
      case "audit_accessibility":
        return runAccessibilityAudit(ctx, params);
      case "screenshot": {
        const target = await ensureTarget(ctx, params.target);
        if (!target) {
          return response("Chrome tab selection cancelled", { action: params.action, cancelled: true });
        }
        const args = [target, params.file].filter((value): value is string => Boolean(value));
        const output = await runChrome("shot", args);
        return response(output || `Captured screenshot for ${target}`, { action: params.action, target, file: params.file });
      }
      case "html": {
        const target = await ensureTarget(ctx, params.target);
        if (!target) {
          return response("Chrome tab selection cancelled", { action: params.action, cancelled: true });
        }
        const args = [target, params.selector].filter((value): value is string => Boolean(value));
        const output = await runChrome("html", args);
        const chunkSize = normalizeHtmlChunkSize(params.htmlChunkSize);
        if (chunkSize !== undefined || params.htmlChunkStart !== undefined) {
          const start = normalizeHtmlChunkStart(params.htmlChunkStart);
          const chunk = chunkHtmlOutput(output, start, chunkSize ?? 20_000);
          return response(chunk.text, {
            action: params.action,
            target,
            selector: params.selector,
            htmlChunk: {
              start: chunk.start,
              end: chunk.end,
              size: chunk.size,
              total: chunk.total,
              hasMore: chunk.hasMore,
              nextStart: chunk.nextStart,
            },
          });
        }
        return response(output, { action: params.action, target, selector: params.selector });
      }
      case "evaluate": {
        if (!params.expression?.trim()) {
          throw new Error("chrome_cdp evaluate requires expression");
        }
        const target = await ensureTarget(ctx, params.target);
        if (!target) {
          return response("Chrome tab selection cancelled", { action: params.action, cancelled: true });
        }
        const output = await runChrome("eval", [target, params.expression]);
        return response(output, { action: params.action, target, expression: params.expression });
      }
      case "navigate": {
        if (!params.url?.trim()) {
          throw new Error("chrome_cdp navigate requires url");
        }
        const target = await ensureTarget(ctx, params.target);
        if (!target) {
          return response("Chrome tab selection cancelled", { action: params.action, cancelled: true });
        }
        const output = await runChrome("nav", [target, params.url]);
        return response(output || `Navigated Chrome tab ${target} to ${params.url}`, {
          action: params.action,
          target,
          url: params.url,
        });
      }
      case "network": {
        const target = await ensureTarget(ctx, params.target);
        if (!target) {
          return response("Chrome tab selection cancelled", { action: params.action, cancelled: true });
        }
        const output = await runChrome("net", [target]);
        return response(output, { action: params.action, target });
      }
      case "click": {
        if (!params.selector?.trim()) {
          throw new Error("chrome_cdp click requires selector");
        }
        const target = await ensureTarget(ctx, params.target);
        if (!target) {
          return response("Chrome tab selection cancelled", { action: params.action, cancelled: true });
        }
        const inspection = await runChromeJson<ActionInspection>(target, buildClickExpression(params.selector), "click");
        if (!inspection.ok) {
          throw new Error(inspection.error ?? `Element not found: ${params.selector}`);
        }
        const deltas = summarizePageDelta(inspection.pageBefore, inspection.pageAfter);
        const summary = [`Clicked ${summarizeElement(inspection.matched)}`];
        if (deltas.length > 0) summary.push(`Changes: ${deltas.join(", ")}`);
        return response(summary.join("\n"), {
          action: params.action,
          target,
          selector: params.selector,
          inspection,
        });
      }
      case "click_coordinates": {
        if (params.x === undefined || params.y === undefined) {
          throw new Error("chrome_cdp click_coordinates requires x and y");
        }
        const target = await ensureTarget(ctx, params.target);
        if (!target) {
          return response("Chrome tab selection cancelled", { action: params.action, cancelled: true });
        }
        const output = await runChrome("clickxy", [target, String(params.x), String(params.y)]);
        return response(output || `Clicked coordinates ${params.x}, ${params.y}`, {
          action: params.action,
          target,
          x: params.x,
          y: params.y,
        });
      }
      case "type": {
        if (!params.text) {
          throw new Error("chrome_cdp type requires text");
        }
        const target = await ensureTarget(ctx, params.target);
        if (!target) {
          return response("Chrome tab selection cancelled", { action: params.action, cancelled: true });
        }
        let focusResult: FocusInspection | undefined;
        if (params.selector?.trim()) {
          focusResult = await runChromeJson<FocusInspection>(target, buildPrepareTypeExpression(params.selector), "type focus");
          if (!focusResult.ok) {
            throw new Error(focusResult.error ?? `Element not found: ${params.selector}`);
          }
        }
        const output = await runChrome("type", [target, params.text]);
        const inspection = params.selector?.trim()
          ? await runChromeJson<FocusInspection>(target, buildInspectExpression(params.selector), "type inspect")
          : undefined;
        if (params.selector?.trim() && inspection?.matched?.value != null && inspection.matched.value !== params.text) {
          throw new Error(`chrome_cdp type expected ${JSON.stringify(params.text)} but found ${JSON.stringify(inspection.matched.value)}`);
        }
        const summary = [
          params.selector?.trim()
            ? `Typed ${params.text.length} characters into ${summarizeElement(inspection?.matched)}`
            : output || `Typed ${params.text.length} characters`,
        ];
        if (focusResult) {
          const deltas = summarizePageDelta(focusResult.pageBefore, inspection?.pageAfter ?? focusResult.pageAfter);
          if (deltas.length > 0) summary.push(`Changes: ${deltas.join(", ")}`);
        }
        return response(summary.join("\n"), {
          action: params.action,
          target,
          selector: params.selector,
          textLength: params.text.length,
          focusResult,
          inspection,
        });
      }
      case "load_all": {
        if (!params.selector?.trim()) {
          throw new Error("chrome_cdp load_all requires selector");
        }
        const target = await ensureTarget(ctx, params.target);
        if (!target) {
          return response("Chrome tab selection cancelled", { action: params.action, cancelled: true });
        }
        const args = [target, params.selector, params.intervalMs ? String(params.intervalMs) : undefined].filter(
          (value): value is string => Boolean(value),
        );
        const output = await runChrome("loadall", args);
        return response(output || `Finished loading more content for ${params.selector}`, {
          action: params.action,
          target,
          selector: params.selector,
          intervalMs: params.intervalMs,
        });
      }
      case "stop": {
        const stopTarget = params.stopAll ? undefined : params.target?.trim() || selectedTarget;
        const stopArgs = params.stopAll ? [] : stopTarget ? [stopTarget] : [];
        await runChrome("stop", stopArgs);
        if (params.stopAll || stopTarget === selectedTarget || (!params.target && !selectedTarget)) {
          setSelectedTarget(undefined);
        }
        return response(stopArgs[0] ? `Stopped Chrome daemon ${stopArgs[0]}` : "Stopped Chrome daemons", {
          action: params.action,
          target: stopArgs[0],
          stopAll: params.stopAll ?? false,
        });
      }
    }
  };

  pi.on("session_start", async (_event, ctx) => {
    selectedTarget = undefined;
    snapshotDeltaCache.clear();
    outputBudgetByTarget.clear();
    for (const entry of [...ctx.sessionManager.getEntries()].reverse()) {
      if (entry.type === "custom" && entry.customType === targetStateType) {
        const target = entry.data && typeof entry.data === "object" ? entry.data.target : undefined;
        selectedTarget = typeof target === "string" && target.trim() ? target.trim() : undefined;
        break;
      }
    }
  });

  pi.registerTool({
    name: "chrome_cdp",
    label: "Chrome CDP",
    description: "Inspect and control a local Chrome tab through the bundled Chrome CDP integration.",
    promptSnippet: "Inspect or control a local Chrome tab without using bash or searching for cdp.mjs.",
    promptGuidelines: [
      "Prefer this tool over bash for Chrome inspection and interaction work.",
      "Do not use bash to search for cdp.mjs or invoke node directly when this tool can do the job.",
      "Default to snapshot(format:\"json\", scope:\"interactive\", includeHidden:false, includeIframes:false); escalate scope only when needed.",
      "Prefer selector-scoped actions over page-wide reads; avoid repeated page-wide html or scope:\"all\" snapshots without new interaction.",
      "For accessibility work, prefer structured snapshot or audit_accessibility output before raw HTML scraping.",
      "When typing into a specific field, pass selector so the tool can focus the target before typing.",
      "Large responses are truncated by default; set allowLargeOutput:true only when broad output is required."
    ],
    parameters: chromeToolSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      return runToolAction(ctx, params as ChromeToolParams);
    },
  });

  pi.registerCommand("chrome-tabs", {
    description: "List open Chrome tabs and remember one for /chrome commands",
    handler: async (_args, ctx) => {
      try {
        const output = await runChrome("list");
        const chosen = await chooseTarget(ctx);
        if (!chosen) {
          ctx.ui.setEditorText(output);
        }
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
      }
    },
  });

  pi.registerCommand("chrome", {
    description: "Run chrome-cdp commands against a remembered Chrome tab",
    getArgumentCompletions: (prefix) => {
      const trimmed = prefix.trimStart();
      const parts = trimmed.split(/\s+/).filter(Boolean);
      if (parts.length > 1) return null;
      return commandNames
        .filter((name) => name.startsWith(parts[0] ?? ""))
        .map((name) => ({ value: name, label: name }));
    },
    handler: async (args, ctx) => {
      const parsed = parseChromeArgs(args);
      if (!parsed) {
        ctx.ui.setEditorText(usageText());
        ctx.ui.notify("Unknown /chrome subcommand", "warning");
        return;
      }

      const { command, args: commandArgs } = parsed;

      try {
        if (command === "help") {
          ctx.ui.setEditorText(usageText());
          return;
        }

        if (command === "clear") {
          setSelectedTarget(undefined);
          ctx.ui.notify("Cleared remembered Chrome tab", "info");
          return;
        }

        if (command === "use") {
          if (!commandArgs[0]) {
            ctx.ui.notify("Usage: /chrome use <target-prefix>", "warning");
            return;
          }
          setSelectedTarget(commandArgs[0]);
          ctx.ui.notify(`Using Chrome tab ${commandArgs[0]}`, "info");
          return;
        }

        if (command === "list") {
          ctx.ui.setEditorText(await runChrome("list"));
          return;
        }

        if (command === "stop") {
          const stopTarget = commandArgs[0] === "all" ? undefined : commandArgs[0] ?? selectedTarget;
          const stopArgs = commandArgs[0] === "all" ? [] : stopTarget ? [stopTarget] : [];
          await runChrome("stop", stopArgs);
          if (!commandArgs[0] || commandArgs[0] === selectedTarget) {
            setSelectedTarget(undefined);
          }
          ctx.ui.notify(stopArgs[0] ? `Stopped Chrome daemon ${stopArgs[0]}` : "Stopped Chrome daemons", "info");
          return;
        }

        const target = await ensureTarget(ctx);
        if (!target) {
          return;
        }

        const output = await runChrome(command, [target, ...commandArgs]);
        if (["snap", "html", "eval", "net"].includes(command)) {
          ctx.ui.setEditorText(output);
        } else {
          ctx.ui.notify(output || `Chrome command finished: ${command}`, "info");
        }
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
      }
    },
  });
}
