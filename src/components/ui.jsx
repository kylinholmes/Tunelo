import React from "react";
import { createPortal } from "react-dom";
import { proxyChain } from "../lib/ipc";

// Inline SVG icons — single style, 14px default, currentColor strokes
export const Icon = ({ name, size = 14, style, className }) => {
  const s = size;
  const common = { width: s, height: s, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", strokeLinejoin: "round", style, className };
  switch (name) {
    case "dashboard": return <svg {...common}><rect x="2" y="2" width="5.5" height="5.5" rx="1"/><rect x="8.5" y="2" width="5.5" height="3" rx="1"/><rect x="8.5" y="6" width="5.5" height="8" rx="1"/><rect x="2" y="8.5" width="5.5" height="5.5" rx="1"/></svg>;
    case "host": return <svg {...common}><rect x="2" y="3" width="12" height="4" rx="1"/><rect x="2" y="9" width="12" height="4" rx="1"/><circle cx="4.5" cy="5" r=".7" fill="currentColor"/><circle cx="4.5" cy="11" r=".7" fill="currentColor"/></svg>;
    case "tunnel": return <svg {...common}><path d="M2 11c0-4 3-7 6-7s6 3 6 7"/><path d="M2 11h12"/><circle cx="4" cy="11" r="1.2"/><circle cx="12" cy="11" r="1.2"/></svg>;
    case "logger": return <svg {...common}><path d="M3 3h7l3 3v7H3z"/><path d="M10 3v3h3"/><path d="M5 8h6M5 10.5h6M5 6h3"/></svg>;
    case "setting": return <svg {...common}><circle cx="8" cy="8" r="2"/><path d="M8 1.5v1.5M8 13v1.5M14.5 8h-1.5M3 8H1.5M12.6 3.4l-1 1M4.4 11.6l-1 1M12.6 12.6l-1-1M4.4 4.4l-1-1"/></svg>;
    case "play": return <svg {...common}><path d="M5 3.5v9l7-4.5z" fill="currentColor" stroke="none"/></svg>;
    case "stop": return <svg {...common}><rect x="4" y="4" width="8" height="8" rx="1" fill="currentColor" stroke="none"/></svg>;
    case "restart": return <svg {...common}><path d="M3 8a5 5 0 1 0 1.5-3.5"/><path d="M3 3v3h3"/></svg>;
    case "edit": return <svg {...common}><path d="M11 2.5l2.5 2.5L6 12.5 3 13l.5-3z"/></svg>;
    case "copy": return <svg {...common}><rect x="3" y="3" width="8" height="8" rx="1"/><path d="M6 6h4v4"/></svg>;
    case "trash": return <svg {...common}><path d="M3 4h10M6 4V2.5h4V4M5 4l.5 9.5h5L11 4M7 7v4M9 7v4"/></svg>;
    case "search": return <svg {...common}><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L13.5 13.5"/></svg>;
    case "plus": return <svg {...common}><path d="M8 3v10M3 8h10"/></svg>;
    case "filter": return <svg {...common}><path d="M2 3h12l-4.5 5.5V13L6.5 12V8.5z"/></svg>;
    case "more": return <svg {...common}><circle cx="3.5" cy="8" r=".9" fill="currentColor"/><circle cx="8" cy="8" r=".9" fill="currentColor"/><circle cx="12.5" cy="8" r=".9" fill="currentColor"/></svg>;
    case "x": return <svg {...common}><path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/></svg>;
    case "chevron": return <svg {...common}><path d="M5 3l5 5-5 5"/></svg>;
    case "chevron-down": return <svg {...common}><path d="M3 5l5 5 5-5"/></svg>;
    case "arrow-right": return <svg {...common}><path d="M3 8h10M9 4l4 4-4 4"/></svg>;
    case "test": return <svg {...common}><path d="M5.5 2v4l-3 6c-.5 1 .3 2 1.4 2h8.2c1.1 0 1.9-1 1.4-2l-3-6V2"/><path d="M4 2h8"/></svg>;
    case "sync": return <svg {...common}><path d="M2.5 8a5.5 5.5 0 0 1 9.5-3.5"/><path d="M13.5 2.5v3h-3"/><path d="M13.5 8a5.5 5.5 0 0 1-9.5 3.5"/><path d="M2.5 13.5v-3h3"/></svg>;
    case "pause": return <svg {...common}><rect x="4" y="3.5" width="2.5" height="9" fill="currentColor" stroke="none" rx=".5"/><rect x="9.5" y="3.5" width="2.5" height="9" fill="currentColor" stroke="none" rx=".5"/></svg>;
    case "export": return <svg {...common}><path d="M8 10V2M4.5 5.5L8 2l3.5 3.5"/><path d="M3 11v2h10v-2"/></svg>;
    case "import": return <svg {...common}><path d="M8 2v8M4.5 6.5L8 10l3.5-3.5"/><path d="M3 11v2h10v-2"/></svg>;
    case "warn": return <svg {...common}><path d="M8 2L1.5 13h13z"/><path d="M8 6.5v3M8 11.5v.01" strokeLinecap="round"/></svg>;
    case "wifi": return <svg {...common}><path d="M2 6c3.5-3 8.5-3 12 0"/><path d="M4 8.5c2.5-2 7.5-2 10 0"/><path d="M6 11c1.5-1 4.5-1 6 0"/><circle cx="8" cy="13" r=".6" fill="currentColor"/></svg>;
    case "check": return <svg {...common}><path d="M3 8.5l3 3 7-7"/></svg>;
    case "tray": return <svg {...common}><rect x="2" y="3" width="12" height="9" rx="1"/><circle cx="6" cy="7.5" r="1" fill="currentColor"/><circle cx="9" cy="7.5" r="1" fill="currentColor"/></svg>;
    case "external": return <svg {...common}><path d="M6 3H3v10h10v-3"/><path d="M9 3h4v4"/><path d="M7 9l6-6"/></svg>;
    case "key": return <svg {...common}><circle cx="5" cy="8" r="2.5"/><path d="M7 8h7M11 8v3M13 8v2"/></svg>;
    default: return <svg {...common}><rect x="2" y="2" width="12" height="12" rx="1"/></svg>;
  }
};

// ─── primitives ───

export const StatusDot = ({ status, size }) => {
  const m = { ok: "ok", connected: "ok", connecting: "info", checking: "info", reconnecting: "warn", warn: "warn", fail: "fail", failed: "fail", error: "fail", idle: "idle", stopping: "idle", unknown: "unknown" };
  return <span className={`dot ${m[status] || "idle"}`} style={size ? { width: size, height: size } : null}/>;
};

export const StatusPill = ({ status, label }) => {
  const m = {
    ok: ["ok", "在线"], connected: ["ok", "已连接"],
    connecting: ["info", "连接中"], checking: ["info", "测试中"],
    reconnecting: ["warn", "重连中"],
    fail: ["fail", "失败"], failed: ["fail", "失败"],
    idle: ["", "空闲"], stopping: ["", "停止中"],
    unknown: ["", "未知"],
  };
  const [cls, defLabel] = m[status] || ["", status];
  return (
    <span className={`spill ${cls}`}>
      <StatusDot status={status}/>
      <span>{label || defLabel}</span>
    </span>
  );
};

export const Tag = ({ children, tone }) => (
  <span className={`chip outline`} style={tone === "config" ? { color: "var(--info)", borderColor: "color-mix(in oklch, var(--info) 30%, var(--border))" } : tone === "manual" ? { color: "var(--fg-2)" } : tone === "orphan" ? { color: "var(--warn)", borderColor: "color-mix(in oklch, var(--warn) 30%, var(--border))" } : null}>
    {children}
  </span>
);

export const Toggle = ({ checked, onChange }) => (
  <button type="button" className="toggle" aria-checked={!!checked} onClick={() => onChange(!checked)}/>
);

export const Seg = ({ value, options, onChange }) => (
  <div className="seg">
    {options.map(o => {
      const v = typeof o === "string" ? o : o.value;
      const label = typeof o === "string" ? o : o.label;
      return <button key={v} type="button" aria-selected={value === v} onClick={() => onChange(v)}>{label}</button>;
    })}
  </div>
);

export const Search = ({ value, onChange, placeholder = "搜索…", kbd }) => (
  <div className="search">
    <Icon name="search" size={12} style={{ color: "var(--fg-3)" }}/>
    <input value={value || ""} onChange={e => onChange?.(e.target.value)} placeholder={placeholder}/>
    {kbd && <span className="kbd-key">{kbd}</span>}
  </div>
);

export const Drawer = ({ open, onClose, title, children, footer, width = 520 }) => {
  // ESC closes; lock body scroll while open.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <>
      <div className="drawer-mask" onClick={onClose}/>
      <div className="drawer" style={{ width }} onClick={(e) => e.stopPropagation()}>
        <div className="hd">
          <div className="title">{title}</div>
          <button type="button" className="iconbtn" onClick={onClose}><Icon name="x"/></button>
        </div>
        <div className="bd">{children}</div>
        {footer && <div className="ft">{footer}</div>}
      </div>
    </>,
    document.body
  );
};

// kvp display for tables-of-fields
export const KV = ({ label, children, mono }) => (
  <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 8, padding: "5px 0", borderBottom: "1px solid var(--border)" }}>
    <div className="dim-2" style={{ fontSize: "var(--fs-xs)", textTransform: "uppercase", letterSpacing: ".06em", paddingTop: 2 }}>{label}</div>
    <div className={mono ? "mono" : ""} style={{ fontSize: "var(--fs-sm)" }}>{children}</div>
  </div>
);

// ProxyJump chain visualization
export const ProxyChain = ({ host, compact }) => {
  const chain = proxyChain(host);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
      {chain.map((h, i) => (
        <React.Fragment key={h.id}>
          {i > 0 && <Icon name="arrow-right" size={10} style={{ color: "var(--fg-3)" }}/>}
          <span className="mono" style={{ fontSize: compact ? "var(--fs-xs)" : "var(--fs-sm)", color: h.status === "ok" ? "var(--fg-1)" : h.status === "fail" ? "var(--fail)" : "var(--fg-2)" }}>
            {h.alias}
          </span>
        </React.Fragment>
      ))}
    </span>
  );
};

// Sparkline
export const Sparkline = ({ values, color = "var(--accent)", width = 60, height = 18 }) => {
  if (!values || !values.length) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 2) - 1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
};

export const Menu = ({ items, align = "right" }) => {
  const [open, setOpen] = React.useState(false);
  const [coords, setCoords] = React.useState(null);
  const btnRef = React.useRef(null);
  const menuRef = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (menuRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onEsc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onEsc); };
  }, [open]);

  const toggle = (e) => {
    e.stopPropagation();
    if (open) { setOpen(false); return; }
    const r = btnRef.current.getBoundingClientRect();
    // Estimate menu height to decide whether to flip up when the button is
    // close to the viewport bottom. Each item is ~32px (button padding
    // 6+6 + line-height ~20), separators are ~9px, plus 8px container
    // padding. Cap by a sensible max.
    const itemH = 32;
    const sepH = 9;
    const padding = 8;
    const estHeight = Math.min(
      400,
      items.reduce((sum, it) => sum + (it === "-" ? sepH : itemH), 0) + padding,
    );
    const gap = 4;
    const viewportH = window.innerHeight;
    const spaceBelow = viewportH - r.bottom;
    const spaceAbove = r.top;
    const flipUp = spaceBelow < estHeight + gap && spaceAbove > spaceBelow;
    const top = flipUp
      ? Math.max(8, r.top - estHeight - gap)
      : r.bottom + gap;
    setCoords({
      top,
      [align === "right" ? "right" : "left"]:
        align === "right" ? (window.innerWidth - r.right) : r.left,
    });
    setOpen(true);
  };

  return (
    <>
      <button ref={btnRef} type="button" className="iconbtn" onClick={toggle} title="更多" aria-expanded={open}>
        <Icon name="more" size={16}/>
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          style={{
            position: "fixed", ...coords,
            background: "var(--bg-1)",
            border: "1px solid var(--border-2)",
            borderRadius: "var(--radius)",
            boxShadow: "0 8px 24px -4px rgba(0,0,0,.45)",
            zIndex: 200,
            padding: 4,
            minWidth: 170,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {items.map((it, i) => {
            if (it === "-") return <div key={i} style={{ height: 1, background: "var(--border)", margin: "5px 2px" }}/>;
            return (
              <button
                key={i}
                type="button"
                disabled={it.disabled}
                onClick={() => { it.onClick?.(); setOpen(false); }}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  width: "100%", padding: "9px 12px",
                  background: "transparent", border: 0, borderRadius: 5,
                  textAlign: "left",
                  color: it.danger ? "var(--fail)" : "var(--fg)",
                  opacity: it.disabled ? .4 : 1,
                  fontSize: "var(--fs-sm)",
                  cursor: it.disabled ? "not-allowed" : "default",
                }}
                onMouseEnter={(e) => { if (!it.disabled) e.currentTarget.style.background = it.danger ? "color-mix(in oklch, var(--fail) 14%, transparent)" : "var(--bg-2)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                {it.icon && <Icon name={it.icon} size={13}/>}
                <span style={{ flex: 1 }}>{it.label}</span>
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </>
  );
};

// Custom Select — fixes native <select>'s ugly OS styling, supports
// two-line option rows (main label + dim mono sub). Dropdown is portal'd
// to body to avoid being clipped by Drawer scroll containers.
//
// options shape: [{ value, label, sub? }]
export const Select = ({ value, onChange, options, placeholder = "选择…", disabled }) => {
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState(null);
  const btnRef = React.useRef(null);
  const listRef = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (listRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = () => {
    if (disabled) return;
    if (open) { setOpen(false); return; }
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    setPos({ left: r.left, top: r.bottom + 4, width: r.width });
    setOpen(true);
  };

  const selected = options.find(o => o.value === value);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="select-trigger"
        onClick={(e) => { e.stopPropagation(); toggle(); }}
        disabled={disabled}
        aria-expanded={open}
      >
        {selected ? (
          <div className="select-current">
            <div className="select-label">{selected.label}</div>
            {selected.sub && <div className="select-sub mono">{selected.sub}</div>}
          </div>
        ) : (
          <div className="select-placeholder">{placeholder}</div>
        )}
        <Icon name="chevron-down" size={12} style={{ color: "var(--fg-3)", flexShrink: 0 }}/>
      </button>
      {open && createPortal(
        <div
          ref={listRef}
          className="select-list"
          style={{ position: "fixed", ...pos, maxHeight: 320 }}
        >
          {options.length === 0 && (
            <div className="select-empty">没有可选项</div>
          )}
          {options.map(o => (
            <button
              key={o.value}
              type="button"
              className="select-item"
              aria-selected={o.value === value}
              onClick={(e) => { e.stopPropagation(); onChange(o.value); setOpen(false); }}
            >
              <div className="select-label">{o.label}</div>
              {o.sub && <div className="select-sub mono">{o.sub}</div>}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  );
};

// Centered modal — for ssh-config import flows
export const Modal = ({ open, onClose, title, children, footer, width }) => {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" style={width ? { width } : null} onClick={e => e.stopPropagation()}>
        <div className="hd">
          <div className="title">{title}</div>
          <button type="button" className="iconbtn" onClick={onClose}><Icon name="x"/></button>
        </div>
        <div className="bd">{children}</div>
        {footer && <div className="ft">{footer}</div>}
      </div>
    </div>,
    document.body
  );
};

// Empty state — for empty pages / no-results
export function EmptyState({ title, hint, cta, icon }) {
  return (
    <div style={{ display: "grid", placeItems: "center", padding: "80px 30px", textAlign: "center" }}>
      <div style={{ width: 60, height: 60, borderRadius: 16, background: "var(--bg-2)", display: "grid", placeItems: "center", marginBottom: 16, color: "var(--fg-3)" }}>
        <Icon name={icon || "tunnel"} size={26}/>
      </div>
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>{title}</div>
      <div className="dim" style={{ fontSize: "var(--fs-sm)", marginBottom: 18, maxWidth: 320 }}>{hint}</div>
      {cta && <button type="button" className="btn primary" onClick={cta.onClick}><Icon name="plus" size={12}/> {cta.label}</button>}
    </div>
  );
}
