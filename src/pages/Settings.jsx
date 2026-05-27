import React from "react";
import { Icon, Toggle } from "../components/ui";
import * as ipc from "../lib/ipc";
import { useNotify } from "../components/Confirm";

// Settings — backed by Rust's AppSettings via get_settings / save_settings.
// Toggle changes save immediately; text fields save on blur to avoid an
// IPC round-trip per keystroke.

export default function SettingsPage() {
  const notify = useNotify();
  const [s, setS] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const [savedAt, setSavedAt] = React.useState(null);
  const [error, setError] = React.useState(null);

  // autostart is OS-level (registry / LaunchAgent), tracked independently
  // of settings.toml — the plugin is the source of truth.
  const [autostart, setAutostart] = React.useState(false);
  const [version, setVersion] = React.useState("");

  React.useEffect(() => {
    ipc.getSettings()
      .then(setS)
      .catch(e => setError(e.message || String(e)));
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
    const next = { ...s, ...patch };
    setS(next);
    setSaving(true);
    setError(null);
    try {
      const saved = await ipc.saveSettings(next);
      setS(saved);
      setSavedAt(Date.now());
    } catch (e) {
      setError(e.message || String(e));
      // pull canonical state back on failure so we don't lie about what's saved
      const fresh = await ipc.getSettings().catch(() => next);
      setS(fresh);
    } finally {
      setSaving(false);
    }
  };

  if (!s) {
    return (
      <div className="page" style={{ overflow: "auto" }}>
        <div style={{ padding: 40 }}>
          {error
            ? <div style={{
                border: "1px solid color-mix(in oklch, var(--fail) 30%, var(--border))",
                background: "color-mix(in oklch, var(--fail) 6%, var(--bg-1))",
                borderRadius: "var(--radius)", padding: "12px 14px",
                fontSize: "var(--fs-sm)", color: "var(--fail)",
              }}>加载设置失败: {error}</div>
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
          <Row label="ssh config 路径" sub="解析此文件用于导入主机和隧道。">
            <PathInput
              value={s.ssh_config_path || ""}
              placeholder="~/.ssh/config"
              onCommit={v => commit({ ssh_config_path: v.trim() || null })}
            />
          </Row>
          <ToggleRow
            label="启动时自动同步 ssh config"
            sub="把新增的主机合并进列表，不覆盖你在 UI 里改过的字段。"
            checked={s.auto_sync_ssh_config}
            onChange={v => commit({ auto_sync_ssh_config: v })}
          />
        </Section>

        <Section title="关于">
          <div style={{ display: "flex", alignItems: "center", gap: 18, padding: "16px 0" }}>
            <div style={{
              width: 52, height: 52, borderRadius: 12,
              display: "grid", placeItems: "center",
              background: "linear-gradient(135deg, var(--accent), color-mix(in oklch, var(--accent) 60%, #2eaf78))",
              color: "#07120c", fontWeight: 800, fontSize: 22, letterSpacing: "-0.04em",
            }}>TL</div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>Tunelo</div>
              <div className="dim" style={{ fontSize: "var(--fs-sm)" }}>
                {version ? `v${version}` : ""} · 跨平台 SSH 隧道管理器
              </div>
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
