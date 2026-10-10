// Which build files an offline page needs. A page works without the network only if its scripts are stored too, and Next loads some chunks lazily
// (an `import()` the first time a screen opens), so the warm-up stores every chunk it can find: the ones a page's HTML names and the whole
// async-chunk map of the webpack runtime. All names are content-hashed (`/_next/static/chunks/4920.b1ada2e26b51c617.js`), so a deploy only brings the
// files that really changed. Pure functions (scripts/check-sw-cache.ts).

const ABS = /\/_next\/static\/[A-Za-z0-9_.()%@\-/]+?\.(?:js|css|woff2?)(?![A-Za-z0-9_.])/g;
const REL = /(?<![A-Za-z0-9_/.])static\/(?:chunks|css|media)\/[A-Za-z0-9_.()%@\-/]+?\.(?:js|css|woff2?)(?![A-Za-z0-9_.])/g;

/** `/_next/static/...` files named in a page's HTML (script / link tags, and the flight data's relative `static/chunks/...` entries). */
export function chunkUrlsFromHtml(html: string): string[] {
  const out = new Set<string>();
  for (const m of html.match(ABS) || []) out.add(m);
  for (const m of html.match(REL) || []) out.add("/_next/" + m);
  return Array.from(out);
}

function mapEntries(src: string): [string, string][] {
  const out: [string, string][] = [];
  const re = /(\d+):"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) out.push([m[1], m[2]]);
  return out;
}

/**
 * Every async chunk of the app, from the webpack runtime (`/_next/static/chunks/webpack-<hash>.js`): the `r.u` function names them as
 * `"static/chunks/"+(({id:"name"})[e]||e)+"."+({id:"hash"})[e]+".js"` (plus a few ids spelled out in full), `r.miniCssF` the stylesheets.
 */
export function chunkUrlsFromRuntime(js: string): string[] {
  const out = new Set<string>();
  for (const m of js.match(/"static\/chunks\/[A-Za-z0-9_.()%@\-/]+\.js"/g) || []) out.add("/_next/" + m.slice(1, -1));
  const u = /"static\/chunks\/"\+\(\(\{([^}]*)\}\)\[e\]\|\|e\)\+"\."\+\(\{([^}]*)\}\)\[e\]\+"\.js"/.exec(js);
  if (u) {
    const names = new Map(mapEntries(u[1]));
    for (const [id, hash] of mapEntries(u[2])) out.add(`/_next/static/chunks/${names.get(id) || id}.${hash}.js`);
  }
  const css = /miniCssF=e=>"static\/css\/"\+\(\{([^}]*)\}\)\[e\]\+"\.css"/.exec(js);
  if (css) for (const [, hash] of mapEntries(css[1])) out.add(`/_next/static/css/${hash}.css`);
  return Array.from(out);
}

/** The webpack runtime url among the resources a page loaded, or "". */
export function runtimeUrl(resourceNames: string[]): string {
  return resourceNames.find((n) => /\/_next\/static\/chunks\/webpack-[A-Za-z0-9]+\.js$/.test(n.split("?")[0])) || "";
}

/** Same-origin build / image files among the resources a page loaded (they were fetched before the service worker controlled the page, so none is stored yet). */
export function storableResources(resourceNames: string[], origin: string): string[] {
  const out: string[] = [];
  for (const n of resourceNames) {
    if (!n.startsWith(origin)) continue;
    const p = n.slice(origin.length).split("#")[0];
    if (/^\/(?:_next\/static\/|i18n\/|icons\/|icons-terminal\/|images\/|landing\/|logo-|icon-)/.test(p)) out.push(p);
  }
  return Array.from(new Set(out));
}
