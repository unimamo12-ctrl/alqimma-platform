/**
 * One-off codemod: add `dark:` counterparts to the light-mode colour utilities
 * this codebase uses.
 *
 * It tokenises each string literal by whitespace and maps whole tokens, never
 * regex-replaces substrings, so `bg-gray-50` cannot be matched inside
 * `bg-gray-500`, and a token that already has a `dark:` sibling is left alone.
 * Static spans of a template literal are mapped too; only the `${...}` holes are
 * left alone.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.argv[2] ?? "src";

// light utility -> dark utility
const MAP = {
  // surfaces
  "bg-white": "dark:bg-slate-900",
  "bg-gray-50": "dark:bg-slate-900/60",
  "bg-gray-100": "dark:bg-slate-800",
  "bg-gray-200": "dark:bg-slate-700",
  "bg-gray-300": "dark:bg-slate-700",

  // borders
  "border-gray-100": "dark:border-slate-800",
  "border-gray-200": "dark:border-slate-700",
  "border-gray-300": "dark:border-slate-600",
  "border-gray-400": "dark:border-slate-600",
  "divide-gray-100": "dark:divide-slate-800",
  "divide-gray-200": "dark:divide-slate-700",

  // text
  "text-gray-900": "dark:text-slate-100",
  "text-gray-800": "dark:text-slate-200",
  "text-gray-700": "dark:text-slate-300",
  "text-gray-600": "dark:text-slate-400",
  "text-gray-500": "dark:text-slate-400",
  "text-gray-400": "dark:text-slate-500",
  "text-gray-300": "dark:text-slate-600",

  // indigo accents
  "bg-indigo-50": "dark:bg-indigo-500/10",
  "text-indigo-700": "dark:text-indigo-300",
  "text-indigo-600": "dark:text-indigo-400",

  // red / rose
  "bg-red-50": "dark:bg-red-500/10",
  "text-red-700": "dark:text-red-300",
  "text-red-600": "dark:text-red-400",
  "border-red-200": "dark:border-red-500/30",
  "border-red-300": "dark:border-red-500/40",

  // green / emerald
  "bg-green-50": "dark:bg-emerald-500/10",
  "text-green-700": "dark:text-emerald-300",
  "text-green-600": "dark:text-emerald-400",
  "border-green-200": "dark:border-emerald-500/30",

  // amber
  "bg-amber-50": "dark:bg-amber-500/10",
  "text-amber-800": "dark:text-amber-200",
  "text-amber-700": "dark:text-amber-300",
  "border-amber-200": "dark:border-amber-500/30",

  // blue
  "bg-blue-50": "dark:bg-blue-500/10",
  "text-blue-700": "dark:text-blue-300",
  "border-blue-200": "dark:border-blue-500/30",

  // purple
  "bg-purple-50": "dark:bg-purple-500/10",
  "text-purple-700": "dark:text-purple-300",

  // slate-ish surfaces already used by the replay button and the public nav
  "bg-slate-50": "dark:bg-slate-800/60",
  "bg-slate-100": "dark:bg-slate-800",
  "bg-slate-200": "dark:bg-slate-700",
  "bg-slate-700": "dark:bg-slate-800",
  "text-slate-900": "dark:text-slate-100",
  "text-slate-800": "dark:text-slate-200",
  "text-slate-700": "dark:text-slate-200",
  "text-slate-600": "dark:text-slate-300",
  "text-slate-500": "dark:text-slate-400",
  "border-slate-100": "dark:border-slate-800",
  "border-slate-200": "dark:border-slate-700",
  "border-slate-300": "dark:border-slate-600",
  "divide-slate-100": "dark:divide-slate-800",
  "divide-slate-200": "dark:divide-slate-700",

  // rose, used by the sign-out button
  "bg-rose-50": "dark:bg-rose-500/10",
  "text-rose-600": "dark:text-rose-400",
  "text-rose-700": "dark:text-rose-300",
  "border-rose-200": "dark:border-rose-500/30",

  // translucent header surfaces. The opacity is part of the token, so `bg-white`
// does not match `bg-white/85` and each one needs its own entry. The low-alpha
// whites (`bg-white/10`, `/15`) are deliberately absent: those sit on dark
// overlays where translucent white is correct in both modes.
  "bg-white/80": "dark:bg-slate-900/80",
  "bg-white/85": "dark:bg-slate-950/85",
  "bg-white/90": "dark:bg-slate-900/90",
  "border-slate-200/80": "dark:border-slate-700/80",

  // slate muted steps. These *are* the light-mode values, but slate-400 on a card
  // that has become slate-900 reads as washed out rather than muted, so the dark
  // side is nudged brighter. slate-300 is already the dark value.
  "text-slate-400": "dark:text-slate-300",
  "text-slate-300": "dark:text-slate-300",

  // light "chip" pairs: an emerald-50 pill stays a glaring near-white block on a
  // dark page unless the background gets an alpha of its own
  "bg-emerald-50": "dark:bg-emerald-500/10",
  "text-emerald-700": "dark:text-emerald-300",
  "text-emerald-800": "dark:text-emerald-200",
  "border-emerald-200": "dark:border-emerald-500/30",
  "bg-green-100": "dark:bg-emerald-500/15",
  "text-green-900": "dark:text-emerald-200",
  "text-green-800": "dark:text-emerald-300",
  "bg-indigo-100": "dark:bg-indigo-500/15",
  "text-indigo-900": "dark:text-indigo-200",
  "text-indigo-800": "dark:text-indigo-200",
  "border-indigo-200": "dark:border-indigo-500/30",
  "bg-purple-100": "dark:bg-purple-500/15",
  "text-purple-900": "dark:text-purple-200",
  "border-purple-200": "dark:border-purple-500/30",
  "bg-yellow-50": "dark:bg-yellow-500/10",
  "text-yellow-700": "dark:text-yellow-300",
  "border-yellow-200": "dark:border-yellow-500/30",
  "bg-amber-100": "dark:bg-amber-500/15",
  "text-amber-900": "dark:text-amber-200",
  "bg-blue-100": "dark:bg-blue-500/15",
  "text-blue-900": "dark:text-blue-200",
  // the coloured icon tiles on the dashboards and the public pages
  "bg-orange-100": "dark:bg-orange-500/15",
  "bg-cyan-50": "dark:bg-cyan-500/10",
  "text-cyan-700": "dark:text-cyan-300",
  "border-cyan-200": "dark:border-cyan-500/30",
  "bg-pink-100": "dark:bg-pink-500/15",
  "bg-sky-100": "dark:bg-sky-500/15",
  "bg-teal-100": "dark:bg-teal-500/15",
  "bg-lime-100": "dark:bg-lime-500/15",
  "bg-fuchsia-100": "dark:bg-fuchsia-500/15",

  // misc
  "placeholder-gray-400": "dark:placeholder-slate-500",
  "placeholder-gray-500": "dark:placeholder-slate-400",
};

/*
 * Variant-specific entries, matched on the whole token before the base map. A
 * hover has to end up lighter than the surface it sits on: reusing the base
 * `bg-gray-50 -> slate-900/60` rule on a slate-900 card produces the identical
 * colour, so the row stops responding to the pointer at all.
 */
const VARIANT_MAP = {
  'hover:bg-gray-50': 'dark:hover:bg-slate-800/70',
  'hover:bg-gray-100': 'dark:hover:bg-slate-800',
  'hover:bg-gray-200': 'dark:hover:bg-slate-700',
  'hover:bg-white': 'dark:hover:bg-slate-800',
  'hover:bg-slate-50': 'dark:hover:bg-slate-800',
  'hover:bg-slate-100': 'dark:hover:bg-slate-800',
  'hover:bg-slate-200': 'dark:hover:bg-slate-700',
};

function mapToken(token) {
  if (!token) return token;
  if (token.startsWith("dark:")) return token;

  /*
   * Variant-specific entries, matched on the whole token before the base map.
   * A hover has to end up lighter than the surface it sits on: reusing the base
   * `bg-gray-50 -> slate-900/60` rule on a slate-900 card produces the identical
   * colour, so the row stops responding to the pointer at all.
   */
  const variantMapped = VARIANT_MAP[token];
  if (variantMapped) return `${token} ${variantMapped}`;

  // split a leading variant chain: hover:group-hover:bg-gray-50
  const parts = token.split(":");
  const base = parts[parts.length - 1];
  const prefix = parts.slice(0, -1);

  /*
   * Opacity is part of the token: `bg-slate-50/60` is not `bg-slate-50`, so a
   * plain lookup missed it. That is how the hero's stat cards kept a
   * near-white 60%-alpha background in dark mode with near-white numbers on top.
   * The alpha is re-attached to the dark value so the surface keeps its weight.
   */
  const slash = base.lastIndexOf("/");
  const baseName = slash === -1 ? base : base.slice(0, slash);
  const alpha = slash === -1 ? "" : base.slice(slash);

  const mapped = MAP[baseName];
  if (!mapped) return token;

  let darkMapped = mapped.startsWith("dark:") ? mapped.slice("dark:".length) : null;
  if (!darkMapped) return token;

  if (alpha) {
    // the mapped value may already carry its own alpha; re-attaching produces
    // `bg-slate-900/60/60`, which is not a class
    const ownSlash = darkMapped.lastIndexOf("/");
    darkMapped = ownSlash === -1 ? darkMapped + alpha : darkMapped.slice(0, ownSlash) + alpha;
  }

  // `dark` is a variant of its own and has to come FIRST in the chain:
  // `dark:hover:bg-slate-800`, not `hover:dark:bg-slate-800`, which Tailwind
  // cannot parse as the hover state of the dark variant at all.
  const lightVariant = [...prefix, base].join(":");
  const darkVariant = ["dark", ...prefix, darkMapped].join(":");

  return `${lightVariant} ${darkVariant}`;
}

function looksLikeClassList(value) {
  if (!value || value.includes("\n")) return false;
  if (/[^\w\s:./%[\]-]/.test(value)) return false;
  /*
   * The variant prefix has to be allowed before the utility. Without it this
   * test only matched a string whose *first* colour token was unprefixed, so
   * `className="hover:bg-gray-50"` was not recognised as a class list at all and
   * was skipped. Those are table-row hover states: left unmapped, hovering a
   * row in dark mode paints it near-white while its text is near-white, and the
   * row vanishes under the cursor.
   */
  return /(?:^|\s)(?:[a-z]+:)*(?:bg|text|border|divide|ring|placeholder|from|to|via|shadow|outline|fill|stroke)-/.test(
    ` ${value}`,
  );
}

function processString(value) {
  const tokens = value.split(/\s+/).filter(Boolean);
  const out = [];

  for (const token of tokens) {
    out.push(token);
    const next = mapToken(token);
    if (next !== token) {
      // append, then drop a duplicate later in the same list
      const darkPart = next.split(" ").slice(1);
      for (const d of darkPart) if (!out.includes(d) && !tokens.includes(d)) out.push(d);
    }
  }

  return out.join(" ");
}

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...walk(full));
    else if (/\.(tsx|ts)$/.test(full) && !full.includes("node_modules")) files.push(full);
  }
  return files;
}

let changedFiles = 0;
let changedStrings = 0;

for (const file of walk(ROOT)) {
  const original = readFileSync(file, "utf8");
  let out = "";
  let i = 0;
  let touched = false;

  while (i < original.length) {
    const ch = original[i];

    /*
     * Template literals are handled too, but only their *static* spans: a
     * `${...}` hole has no knowable value, and skipping the whole template — as
     * the first version of this script did — silently left every component that
     * interpolates its className stuck in light mode. The shared `Card` is one
     * of those, so it affected most of the app.
     */
    if (ch === "`") {
      let j = i + 1;
      while (j < original.length && original[j] !== "`") {
        if (original[j] === "\\") j += 1;
        j += 1;
      }
      const body = original.slice(i + 1, j);

      // split into static spans and holes, keeping the holes verbatim
      const pieces = body.split(/(\$\{[^}]*\})/g);
      let templateTouched = false;

      const rebuilt = pieces
        .map((piece) => {
          if (piece.startsWith("${")) return piece;
          if (!looksLikeClassList(piece)) return piece;
          const replaced = processString(piece);
          if (replaced !== piece) templateTouched = true;
          return replaced;
        })
        .join("");

      if (templateTouched) {
        out += "`" + rebuilt + "`";
        changedStrings += 1;
        touched = true;
      } else {
        out += original.slice(i, j + 1);
      }
      i = j + 1;
      continue;
    }

    // only rewrite inside single/double quoted strings, never inside templates
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < original.length && original[j] !== ch) {
        if (original[j] === "\\") j += 1;
        if (original[j] === "\n") break;
        j += 1;
      }
      const raw = original.slice(i + 1, j);
      if (!raw.includes("${") && looksLikeClassList(raw)) {
        const replaced = processString(raw);
        if (replaced !== raw) {
          out += ch + replaced + ch;
          changedStrings += 1;
          touched = true;
          i = j + 1;
          continue;
        }
      }
      out += original.slice(i, j + 1);
      i = j + 1;
      continue;
    }

    out += ch;
    i += 1;
  }

  if (touched) {
    writeFileSync(file, out, "utf8");
    changedFiles += 1;
    console.log(`  ${relative(process.cwd(), file)}`);
  }
}

console.log(`\n${changedStrings} class strings across ${changedFiles} files`);