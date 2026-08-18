import React from "react";
import { Icon, Toggle } from "../components/ui";
import ThemePicker from "../components/ThemePicker";
import { resolveTheme, accentOf, DEFAULT_THEME_ID } from "../lib/themes";
import { checkForUpdate, RELEASES_URL } from "../lib/updates";
import * as ipc from "../lib/ipc";
import { useNotify } from "../components/Confirm";

// Settings — Rust's AppSettings (settings.toml). App owns the loaded object
// and the write path (`onPatch`); this page only renders it and reports
// save status. Toggle changes save immediately; text fields save on blur to
// avoid an IPC round-trip per keystroke.

export default function SettingsPage({ settings: s, settingsError, onPatch }) {
  const notify = useNotify();
  const [saving, setSaving] = React.useState(false);
  const [savedAt, setSavedAt] = React.useState(null);
  const [error, setError] = React.useState(null);

  // autostart is OS-level (registry / LaunchAgent), tracked independently
  // of settings.toml — the plugin is the source of truth.
  const [autostart, setAutostart] = React.useState(false);
  const [version, setVersion] = React.useState("");

  React.useEffect(() => {
    ipc.isAutostartEnabled()
      .then(setAutostart)
      .catch(() => {});
    ipc.getAppVersion()
      .then(setVersion)
      .catch(() => {});
  }, []);

  const toggleAutostart = async (want) => {
    try {
      await ipc.setAutostartEnabled(want);
      setAutostart(want);
    } catch (e) {
      notify({ title: "切换开机自启失败", message: e.message || String(e), kind: "error" });
    }
  };

  const commit = async (patch) => {
    if (!s) return;
    setSaving(true);
    setError(null);
    try {
      await onPatch(patch);
      setSavedAt(Date.now());
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  if (!s) {
    return (
      <div className="page" style={{ overflow: "auto" }}>
        <div style={{ padding: 40 }}>
          {settingsError
            ? <div style={{
                border: "1px solid color-mix(in oklch, var(--fail) 30%, var(--border))",
                background: "color-mix(in oklch, var(--fail) 6%, var(--bg-1))",
                borderRadius: "var(--radius)", padding: "12px 14px",
                fontSize: "var(--fs-sm)", color: "var(--fail)",
              }}>加载设置失败: {settingsError}</div>
            : <div className="dim">加载设置中…</div>
          }
        </div>
      </div>
    );
  }

  return (
    <div className="page" style={{ overflow: "auto" }}>
      <div style={{ padding: "32px 40px", maxWidth: 720, margin: "0 auto", position: "relative" }}>
        <SaveBadge saving={saving} savedAt={savedAt} error={error}/>

        <Section title="启动与托盘">
          <ToggleRow
            label="开机自启"
            sub="登录系统后静默启动到托盘。系统层注册（注册表 / LaunchAgent）。"
            checked={autostart}
            onChange={toggleAutostart}
          />
          <ToggleRow
            label="启动后自动连接"
            sub="自动连接标记为「应用启动时自动连接」的隧道。"
            checked={s.auto_connect_on_boot}
            onChange={v => commit({ auto_connect_on_boot: v })}
          />
          <ToggleRow
            label="关闭主窗口时最小化到托盘"
            sub="关闭按钮的语义。关闭即退出请关闭此项。"
            checked={s.minimize_to_tray_on_close}
            onChange={v => commit({ minimize_to_tray_on_close: v })}
          />
        </Section>

        <Section title="SSH">
          <Row label="ssh 可执行路径" sub="启动时自动探测；路径失效会重新检测。手动指定的有效路径会被保留。">
            <PathInput
              value={s.ssh_path || ""}
              placeholder="C:\\Windows\\System32\\OpenSSH\\ssh.exe"
              onCommit={v => commit({ ssh_path: v.trim() || null })}
            />
          </Row>
          <Row label="ssh config 路径" sub="解析此文件用于导入主机和隧道（在 Hosts / Tunnels 页手动导入）。">
            <PathInput
              value={s.ssh_config_path || ""}
              placeholder="~/.ssh/config"
              onCommit={v => commit({ ssh_config_path: v.trim() || null })}
            />
          </Row>
        </Section>

        <Section title="外观">
          <AppearanceRow settings={s} onCommit={commit}/>
        </Section>

        <Section title="关于">
          <div style={{ display: "flex", alignItems: "center", gap: 18, padding: "16px 0" }}>
            <div style={{
              width: 52, height: 52, borderRadius: 12,
              display: "grid", placeItems: "center",
              background: "linear-gradient(135deg, var(--accent), color-mix(in oklch, var(--accent) 60%, #2eaf78))",
              color: "var(--on-accent)", fontWeight: 800, fontSize: 22, letterSpacing: "-0.04em",
            }}>TL</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                Tunelo
                {version && version !== "web" && <span className="chip outline mono" style={{ height: 20 }}>v{version}</span>}
              </div>
              <div className="dim" style={{ fontSize: "var(--fs-sm)" }}>跨平台 SSH 隧道管理器</div>
              <UpdateHint version={version}/>
            </div>
            <div style={{ flex: 1 }}/>
            <button
              type="button"
              className="btn"
              onClick={() => ipc.openExternal("https://github.com/kylinholmes/Tunelo")}
            >
              <Icon name="external" size={11}/> GitHub
            </button>
          </div>
        </Section>
      </div>
    </div>
  );
}

// "有新版本 v0.9.7 →" under the version, checked against GitHub Releases
// (cached a few hours). Silent when up to date or when the check can't run.
function UpdateHint({ version }) {
  const [state, setState] = React.useState({ phase: "idle" }); // idle | checking | result | error
  const run = React.useCallback(async (force) => {
    setState({ phase: "checking" });
    try {
      const r = await checkForUpdate(version, { force });
      setState(r ? { phase: "result", ...r } : { phase: "idle" });
    } catch (e) {
      setState({ phase: "error", message: e.message || String(e) });
    }
  }, [version]);
  React.useEffect(() => { if (version && version !== "web") run(false); }, [version, run]);

  if (!version || version === "web") return null;
  const linkStyle = { background: "transparent", border: 0, padding: 0, font: "inherit", cursor: "default", color: "var(--fg-3)" };
  if (state.phase === "checking") return <div className="dim-2" style={{ fontSize: "var(--fs-xs)", marginTop: 4 }}>正在检查更新…</div>;
  if (state.phase === "error") {
    return (
      <div className="dim-2" style={{ fontSize: "var(--fs-xs)", marginTop: 4 }}>
        无法检查更新（{state.message}）· <button type="button" style={linkStyle} onClick={() => run(true)}>重试</button>
      </div>
    );
  }
  if (state.phase === "result" && state.newer) {
    return (
      <div style={{ fontSize: "var(--fs-xs)", marginTop: 6, display: "flex", alignItems: "center", gap: 8 }}>
        <span className="spill info"><span className="dot info"/>有新版本 v{state.latest}</span>
        <button type="button" className="btn sm" onClick={() => ipc.openExternal(state.url || RELEASES_URL)}>
          <Icon name="external" size={10}/> 前往下载
        </button>
      </div>
    );
  }
  if (state.phase === "result") {
    return (
      <div className="dim-2" style={{ fontSize: "var(--fs-xs)", marginTop: 4 }}>
        已是最新版本 · <button type="button" style={linkStyle} onClick={() => run(true)}>重新检查</button>
      </div>
    );
  }
  return null;
}

// Theme picker is collapsed behind a summary row by default — the full grid
// is tall and only needed when actually switching.
function AppearanceRow({ settings, onCommit }) {
  const [open, setOpen] = React.useState(false);
  const themeId = settings.theme || DEFAULT_THEME_ID;
  const customThemes = settings.custom_themes || [];
  const active = resolveTheme(themeId, customThemes);
  return (
    <div style={{ borderBottom: "1px solid var(--border)" }}>
      <button
        type="button"
        className="appearance-row"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: "var(--fs-md)" }}>主题</div>
          <div className="dim-2" style={{ fontSize: "var(--fs-xs)", marginTop: 3 }}>内置 20 余套终端配色，或粘贴 Windows Terminal 配色方案自定义。</div>
        </div>
        <div className="appearance-current">
          <span className="appearance-swatch" style={{ background: active.background, borderColor: accentOf(active) }}>
            <span style={{ background: active.red }}/><span style={{ background: accentOf(active) }}/><span style={{ background: active.blue }}/>
          </span>
          <span className="tr">{active.name}</span>
          <Icon name="chevron-down" size={13} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s", color: "var(--fg-3)" }}/>
        </div>
      </button>
      {open && (
        <div className="fade-in" style={{ padding: "4px 0 18px" }}>
          <ThemePicker
            value={themeId}
            customThemes={customThemes}
            onChange={id => onCommit({ theme: id })}
            onCustomThemesChange={(list, selectId) => onCommit({ custom_themes: list, ...(selectId ? { theme: selectId } : {}) })}
          />
        </div>
      )}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 36 }}>
      <div style={{ fontSize: "var(--fs-xs)", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--fg-3)", fontWeight: 600, marginBottom: 12 }}>{title}</div>
      <div>{children}</div>
    </div>
  );
}

function Row({ label, sub, children }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 20, alignItems: "center", padding: "14px 0", borderBottom: "1px solid var(--border)" }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: "var(--fs-md)" }}>{label}</div>
        {sub && <div className="dim-2" style={{ fontSize: "var(--fs-xs)", marginTop: 3 }}>{sub}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

function ToggleRow({ label, sub, checked, onChange }) {
  return (
    <Row label={label} sub={sub}>
      <Toggle checked={checked} onChange={onChange}/>
    </Row>
  );
}

// Text input that defers committing until blur (or Enter) so we don't
// thrash the disk on every keystroke.
function PathInput({ value, placeholder, onCommit }) {
  const [local, setLocal] = React.useState(value);
  React.useEffect(() => { setLocal(value); }, [value]);

  return (
    <input
      className="input mono"
      value={local}
      placeholder={placeholder}
      onChange={e => setLocal(e.target.value)}
      onBlur={() => { if (local !== value) onCommit(local); }}
      onKeyDown={e => {
        if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
        if (e.key === "Escape") { setLocal(value); e.currentTarget.blur(); }
      }}
      style={{ width: 320 }}
    />
  );
}

function SaveBadge({ saving, savedAt, error }) {
  // Show a tiny indicator at the top-right of the page to confirm writes.
  let content = null;
  if (error) {
    content = <span style={{ color: "var(--fail)" }}>保存失败</span>;
  } else if (saving) {
    content = <span style={{ color: "var(--info)" }}>保存中…</span>;
  } else if (savedAt) {
    content = <span style={{ color: "var(--ok)" }}>已保存</span>;
  }
  if (!content) return null;
  return (
    <div style={{
      position: "absolute", top: 32, right: 40,
      fontSize: "var(--fs-xs)",
      display: "inline-flex", alignItems: "center", gap: 6,
    }}>{content}</div>
  );
}
