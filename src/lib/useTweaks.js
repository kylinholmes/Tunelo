import React from "react";

// Simplified replacement for the design-tool useTweaks hook.
// Persists purely-local UI choices (nav layout, corner radius) via localStorage.
// The theme is NOT here — it lives in settings.toml (see App.jsx).
const KEY = "freetunnel.tweaks";

export function useTweaks(defaults) {
  const [t, setT] = React.useState(() => {
    try {
      const stored = localStorage.getItem(KEY);
      if (stored) return { ...defaults, ...JSON.parse(stored) };
    } catch {}
    return defaults;
  });

  const setTweak = React.useCallback((key, value) => {
    setT(prev => {
      const next = { ...prev, [key]: value };
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  return [t, setTweak];
}
