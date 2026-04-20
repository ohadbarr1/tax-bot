import { describe, it, expect } from "vitest";
import { readdirSync, statSync, readFileSync } from "fs";
import { join, relative } from "path";

const APP_DIR = join(__dirname, "..", "..", "app");

function collectPageRoutes(dir: string, routes: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) collectPageRoutes(p, routes);
    else if (name === "page.tsx" || name === "page.ts") routes.push(toRoute(p));
  }
  return routes;
}

function collectApiRoutes(dir: string, routes: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) collectApiRoutes(p, routes);
    else if (name === "route.ts" || name === "route.tsx") routes.push(toRoute(p));
  }
  return routes;
}

function toRoute(filePath: string): string {
  let rel = "/" + relative(APP_DIR, filePath).replace(/\\/g, "/");
  rel = rel.replace(/\/(page|route)\.(tsx?|jsx?)$/, "");
  rel = rel.replace(/\/\([^/]+\)/g, "");
  if (rel === "") rel = "/";
  return rel;
}

function collectSourceFiles(dir: string, files: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === "__tests__") continue;
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) collectSourceFiles(p, files);
    else if (/\.(tsx?|jsx?)$/.test(name)) files.push(p);
  }
  return files;
}

const DYNAMIC_PATTERN = /\[([^\]]+)\]/g;

function matchesRoute(href: string, routes: string[]): boolean {
  const cleaned = href.split("?")[0].split("#")[0].replace(/\/$/, "") || "/";
  if (routes.includes(cleaned)) return true;
  for (const r of routes) {
    if (!DYNAMIC_PATTERN.test(r)) continue;
    DYNAMIC_PATTERN.lastIndex = 0;
    const regex = new RegExp(
      "^" + r.replace(/\[\.\.\.[^\]]+\]/g, ".+").replace(/\[[^\]]+\]/g, "[^/]+") + "$",
    );
    if (regex.test(cleaned)) return true;
  }
  return false;
}

describe("Route manifest", () => {
  const pageRoutes = collectPageRoutes(APP_DIR).sort();
  const apiRoutes = collectApiRoutes(join(APP_DIR, "api")).sort();

  it("app page route list is stable", () => {
    expect(pageRoutes).toMatchInlineSnapshot(`
      [
        "/",
        "/about",
        "/admin",
        "/admin/files",
        "/admin/users",
        "/admin/users/[uid]",
        "/dashboard",
        "/details",
        "/documents",
        "/draft",
        "/draft/[draftId]",
        "/education",
        "/facts",
        "/filing",
        "/history",
        "/how-it-works",
        "/income-tax",
        "/pricing",
        "/privacy",
        "/profile",
        "/questionnaire",
        "/questionnaire/[step]",
        "/settings",
        "/tax-calculator",
        "/terms",
        "/welcome",
      ]
    `);
  });

  it("API route list is stable", () => {
    expect(apiRoutes).toMatchInlineSnapshot(`
      [
        "/api/admin/files",
        "/api/admin/files/signed-url",
        "/api/admin/stats",
        "/api/admin/users",
        "/api/admin/users/[uid]",
        "/api/admin/users/[uid]/disable",
        "/api/admin/whoami",
        "/api/advisor",
        "/api/advisor/nudges",
        "/api/generate/form-1214",
        "/api/generate/form-1301",
        "/api/generate/form-1322",
        "/api/generate/form-135",
        "/api/generate/form-161",
        "/api/generate/form-867",
        "/api/mine/document",
        "/api/parse/form-106",
        "/api/parse/ibkr",
        "/api/user/delete",
        "/api/user/export",
      ]
    `);
  });
});

describe("Link audit", () => {
  const allRoutes = [
    ...collectPageRoutes(APP_DIR),
    ...collectApiRoutes(join(APP_DIR, "api")),
  ];
  const SRC_ROOTS = [
    join(__dirname, "..", "..", "app"),
    join(__dirname, "..", "..", "components"),
  ];
  const files = SRC_ROOTS.flatMap((r) => collectSourceFiles(r));
  const HREF_RE = /href=["'`](\/[\w\-[\]/]*)["'`]/g;
  const PUSH_RE = /router\.(?:push|replace)\(\s*["'`](\/[\w\-[\]/]*)["'`]/g;

  it("every internal href/push target resolves to a known route", () => {
    const dead: { file: string; href: string }[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      for (const re of [HREF_RE, PUSH_RE]) {
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(src))) {
          const href = m[1];
          if (href === "/" || href.startsWith("/#")) continue;
          if (!matchesRoute(href, allRoutes)) {
            dead.push({ file: relative(join(__dirname, "..", ".."), f), href });
          }
        }
      }
    }
    expect(dead).toEqual([]);
  });
});
