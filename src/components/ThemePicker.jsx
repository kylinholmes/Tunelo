import React from "react";
import { Icon, Modal, Select } from "./ui";
import { useConfirm } from "./Confirm";
import * as ipc from "../lib/ipc";
import {
  BUILTIN_THEMES, accentOf, isDarkTheme, parseScheme, resolveTheme, schemeToJson, themeToVars,
} from "../lib/themes";

const SCHEMES_URL = "https://github.com/mbadolato/iTerm2-Color-Schemes/tree/master/windowsterminal";
const DOT_KEYS = ["red", "green", "yellow", "blue", "purple", "cyan"];

// Theme grid + editor for custom themes. `value` is the active theme id;
// `customThemes` is the user's own list. Both are persisted by the caller;
// `onCustomThemesChange(list, selectId?)` bundles a list edit with the theme
// to switch to so the caller can persist both in one write.
export default function ThemePicker({ value, customThemes = [], onChange, onCustomThemesChange }) {
  const askConfirm = useConfirm();
  const [editor, setEditor] = React.useState(null); // null | { theme?: customTheme }
  const active = resolveTheme(value, customThemes);

  const saveCustom = (theme) => {
    const exists = customThemes.some(t => t.id === theme.id);
    onCustomThemesChange(exists ? customThemes.map(t => (t.id === theme.id ? theme : t)) : [...customThemes, theme], theme.id);
    setEditor(null);
  };

  const deleteCustom = async (theme) => {
    const ok = await askConfirm({
      title: "删除主题",
      message: `确定删除自定义主题「${theme.name}」？`,
      confirmLabel: "删除",
      danger: true,
    });
    if (!ok) return;
    onCustomThemesChange(customThemes.filter(t => t.id !== theme.id), active.id === theme.id ? BUILTIN_THEMES[0].id : undefined);
  };

  return (
    <div>
      <div className="theme-grid">
        {BUILTIN_THEMES.map(t => (
          <ThemeCard key={t.id} theme={t} selected={active.id === t.id} onClick={() => onChange(t.id)}/>
        ))}
        {customThemes.map(t => (
          <ThemeCard
            key={t.id} theme={t} selected={active.id === t.id} custom
            onClick={() => onChange(t.id)}
            onEdit={() => setEditor({ theme: t })}
            onDelete={() => deleteCustom(t)}
          />
        ))}
        <button type="button" className="theme-card theme-card-add" onClick={() => setEditor({})}>
          <Icon name="plus" size={14}/>
          <span>自定义主题</span>
        </button>
      </div>
      <div className="help" style={{ marginTop: 10 }}>
        自定义主题使用 Windows Terminal 配色方案格式（16 色 + background / foreground）。
        从 Windows Terminal 的 settings.json，或
        {" "}<a href="#" onClick={e => { e.preventDefault(); ipc.openExternal(SCHEMES_URL); }}>iTerm2-Color-Schemes</a>{" "}
        的 450+ 个方案里复制 JSON 粘贴即可。
      </div>

      {editor && (
        <ThemeEditor
          initial={editor.theme}
          base={active}
          customThemes={customThemes}
          onCancel={() => setEditor(null)}
          onSave={saveCustom}
        />
      )}
    </div>
  );
}

function ThemeCard({ theme, selected, custom, onClick, onEdit, onDelete }) {
  const accent = accentOf(theme);
  return (
    <div
      className="theme-card"
      role="button"
      tabIndex={0}
      aria-selected={selected}
      data-custom={custom || undefined}
      onClick={onClick}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      style={{
        background: theme.background,
        color: theme.foreground,
        "--card-accent": accent,
      }}
      title={theme.name}
    >
      <div className="theme-card-top">
        <span className="theme-card-name tr">{theme.name}</span>
        {selected && <Icon name="check" size={13} className="theme-card-check" style={{ color: accent, flexShrink: 0 }}/>}
      </div>
      <div className="theme-card-dots">
        {DOT_KEYS.map(k => <span key={k} className="theme-card-dot" style={{ background: theme[k] }}/>)}
      </div>
      <div className="theme-card-sample" style={{ borderColor: `color-mix(in srgb, ${theme.foreground} 14%, transparent)` }}>
        <span className="theme-card-btn" style={{ background: accent, color: themeToVars(theme)["--on-accent"] }}>Aa</span>
        <span style={{ opacity: .6 }}>ssh -L</span>
      </div>
      {custom && (
        <div className="theme-card-actions" onClick={e => e.stopPropagation()}>
          <button type="button" className="iconbtn" title="编辑" onClick={onEdit}><Icon name="edit" size={12}/></button>
          <button type="button" className="iconbtn" title="删除" onClick={onDelete}><Icon name="trash" size={12}/></button>
        </div>
      )}
    </div>
  );
}

// Modal for creating / editing a custom theme: name + scheme JSON, with a
// live preview rendered through the same token pipeline as the real app.
function ThemeEditor({ initial, base, customThemes, onCancel, onSave }) {
  const isEdit = !!initial;
  const [name, setName] = React.useState(initial?.name || "");
  const [json, setJson] = React.useState(() => schemeToJson(initial || base));
  const [copyFrom, setCopyFrom] = React.useState(initial?.id || base.id);

  const parsed = React.useMemo(
    () => parseScheme(json, { id: initial?.id || "preview", name: name.trim() || "预览" }),
    [json, name, initial]
  );
  const nameMissing = !name.trim();

  const sources = [...BUILTIN_THEMES, ...customThemes].map(t => ({ value: t.id, label: t.name }));
  const loadFrom = (id) => {
    setCopyFrom(id);
    const t = resolveTheme(id, customThemes);
    setJson(schemeToJson(t));
    if (!isEdit && !name.trim()) setName(t.name + " (副本)");
  };

  const save = () => {
    if (parsed.error || nameMissing) return;
    const r = parseScheme(json, { id: initial?.id, name: name.trim() });
    if (r.theme) onSave(r.theme);
  };

  return (
    <Modal
      open
      onClose={onCancel}
      title={isEdit ? "编辑主题" : "新建自定义主题"}
      width={720}
      footer={
        <>
          <span className="help" style={{ flex: 1 }}>
            {parsed.error
              ? <span style={{ color: "var(--fail)" }}>{parsed.error}</span>
              : nameMissing ? "请填写主题名称" : "配色有效"}
          </span>
          <button type="button" className="btn ghost" onClick={onCancel}>取消</button>
          <button type="button" className="btn primary" disabled={!!parsed.error || nameMissing} onClick={save}>
            保存并应用
          </button>
        </>
      }
    >
      <div className="row-2" style={{ gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className="field">
          <label>名称</label>
          <input className="input" value={name} placeholder="我的主题" onChange={e => setName(e.target.value)} autoFocus/>
        </div>
        <div className="field">
          <label>从现有主题复制</label>
          <Select value={copyFrom} onChange={loadFrom} options={sources}/>
        </div>
      </div>

      <div className="field">
        <label>配色方案 JSON（Windows Terminal 格式）</label>
        <textarea
          className="textarea mono"
          rows={12}
          spellCheck={false}
          value={json}
          onChange={e => setJson(e.target.value)}
          style={{ resize: "vertical", lineHeight: 1.45, fontSize: "var(--fs-xs)" }}
        />
        <div className="help">
          必填：background、foreground 与 16 个 ANSI 色（black … brightWhite）。
          可选：<span className="mono">accent</span> — 指定强调色，可以是 16 色之一的名字（如 blue）或 #rrggbb，默认用 green。
        </div>
      </div>

      <div className="field" style={{ marginBottom: 0 }}>
        <label>预览</label>
        <ThemePreview theme={parsed.theme}/>
      </div>
    </Modal>
  );
}

// A miniature of the app shell painted with the candidate theme's tokens.
function ThemePreview({ theme }) {
  if (!theme) {
    return <div className="theme-preview theme-preview-empty">修正上面的错误后显示预览</div>;
  }
  const vars = themeToVars(theme);
  return (
    <div className="theme-preview" style={{ ...vars, colorScheme: isDarkTheme(theme) ? "dark" : "light" }}>
      <div className="theme-preview-rail">
        <div className="theme-preview-nav" aria-selected="true">总览</div>
        <div className="theme-preview-nav">Tunnels</div>
        <div className="theme-preview-nav">Hosts</div>
      </div>
      <div className="theme-preview-main">
        <div className="theme-preview-bar">
          <span style={{ fontWeight: 600 }}>{theme.name}</span>
          <span style={{ flex: 1 }}/>
          <span className="spill ok"><span className="dot ok"/>运行中</span>
          <span className="spill warn"><span className="dot warn"/>重连</span>
          <span className="spill fail"><span className="dot fail"/>失败</span>
        </div>
        <div className="card" style={{ margin: 10 }}>
          <div className="hd">db-tunnel <span className="dim">via</span> <span style={{ color: "var(--info)" }}>jump-host</span></div>
          <div className="bd" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span className="mono dim">localhost:5432 → 10.0.0.8:5432</span>
            <span style={{ flex: 1 }}/>
            <button type="button" className="btn sm" tabIndex={-1}>停止</button>
            <button type="button" className="btn sm primary" tabIndex={-1}>启动</button>
          </div>
        </div>
      </div>
    </div>
  );
}
