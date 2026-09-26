/**
 * ThreeUI ships each effect as a self-contained HTML document imported with
 * Vite's `?raw` suffix, and the registered component keeps those imports
 * verbatim. Turbopack resolves the same query through the `*.html` rule in
 * next.config.ts; this declaration is what makes TypeScript accept it.
 */
declare module "*.html?raw" {
  const source: string;
  export default source;
}
