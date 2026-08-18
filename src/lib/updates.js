// Update check against GitHub Releases. Pure frontend: the GitHub API sends
// CORS headers, the Tauri CSP is open, and the web build runs in a normal
// browser — so no backend hop is needed. Results are cached for a few hours
// to stay well under GitHub's 60 req/h unauthenticated limit.

export const REPO = "kylinholmes/Tunelo";
export const RELEASES_URL = `https://github.com/${REPO}/releases`;
const API = `https://api.github.com/repos/${REPO}/releases/latest`;
const CACHE_KEY = "tunelo.update-check";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

// "v0.9.7" / "0.9.7-beta.1" → [0, 9, 7]; anything unparsable → null
export function parseVersion(v) {
  const m = /^v?(\d+)\.(\d+)(?:\.(\d+))?/.exec(String(v || "").trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3] || 0)] : null;
}

// >0 if a is newer than b, <0 if older, 0 if equal; null if either is unparsable
export function compareVersions(a, b) {
  const pa = parseVersion(a), pb = parseVersion(b);
  if (!pa || !pb) return null;
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

// Resolves to { latest, url, newer, checkedAt } or null when the check can't
// be performed (offline, rate-limited, unknown current version).
export async function checkForUpdate(current, { force = false } = {}) {
  if (!parseVersion(current)) return null;
  if (!force) {
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY));
      if (cached && Date.now() - cached.checkedAt < CACHE_TTL_MS && cached.latest) {
        return { ...cached, newer: compareVersions(cached.latest, current) > 0 };
      }
    } catch {}
  }
  const res = await fetch(API, { headers: { Accept: "application/vnd.github+json" } });
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  const j = await res.json();
  const latest = String(j.tag_name || j.name || "").replace(/^v/, "");
  if (!parseVersion(latest)) return null;
  const result = { latest, url: j.html_url || RELEASES_URL, checkedAt: Date.now() };
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(result)); } catch {}
  return { ...result, newer: compareVersions(latest, current) > 0 };
}
