import React from "react";
import { Icon, Modal } from "./ui";

// Themed replacements for window.confirm and window.alert. Imperative API:
//
//   const askConfirm = useConfirm();
//   const ok = await askConfirm({
//     title: "删除隧道",
//     message: "确定删除「pg-prod」？此操作不可撤销。",
//     confirmLabel: "删除",
//     danger: true,
//   });
//
//   const notify = useNotify();
//   await notify({
//     title: "启动失败",
//     message: "隧道已在运行",
//     kind: "error",
//   });
//
// `ask` resolves to boolean (true confirmed / false cancelled).
// `notify` resolves to undefined when dismissed; supports `kind: "error"`
// to tint the message in fail colour and prefix with an icon.

const Context = React.createContext({
  ask: async () => false,
  notify: async () => undefined,
});

export const useConfirm = () => React.useContext(Context).ask;
export const useNotify = () => React.useContext(Context).notify;

export function ConfirmProvider({ children }) {
  const [opts, setOpts] = React.useState(null);
  const resolverRef = React.useRef(null);

  const open = React.useCallback((options) => new Promise((resolve) => {
    // Cancel a pending dialog if a new one is requested. Resolve it as
    // dismissed so the awaiter doesn't hang forever.
    if (resolverRef.current) {
      resolverRef.current(options.notifyOnly ? undefined : false);
    }
    resolverRef.current = resolve;
    setOpts(options);
  }), []);

  const ask = React.useCallback(
    (options) => open({ ...options, notifyOnly: false }),
    [open],
  );
  const notify = React.useCallback(
    (options) => open({ ...options, notifyOnly: true }),
    [open],
  );

  const finish = React.useCallback((result) => {
    const fn = resolverRef.current;
    resolverRef.current = null;
    setOpts(null);
    fn?.(result);
  }, []);

  const value = React.useMemo(() => ({ ask, notify }), [ask, notify]);

  const isError = opts?.kind === "error";
  const defaultTitle = opts?.notifyOnly
    ? (isError ? "出错了" : "提示")
    : "确认";

  return (
    <Context.Provider value={value}>
      {children}
      <Modal
        open={!!opts}
        onClose={() => finish(opts?.notifyOnly ? undefined : false)}
        width={440}
        title={opts?.title || defaultTitle}
        footer={
          opts?.notifyOnly
            ? <>
                <div style={{ flex: 1 }}/>
                <button className="btn primary" onClick={() => finish(undefined)} autoFocus>
                  {opts?.confirmLabel || "确定"}
                </button>
              </>
            : <>
                <div style={{ flex: 1 }}/>
                <button className="btn ghost" onClick={() => finish(false)}>
                  {opts?.cancelLabel || "取消"}
                </button>
                <button
                  className={opts?.danger ? "btn danger solid" : "btn primary"}
                  onClick={() => finish(true)}
                  autoFocus
                >
                  {opts?.confirmLabel || "确认"}
                </button>
              </>
        }
      >
        {opts?.message && (
          <div style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
          }}>
            {isError && (
              <Icon name="warn" size={18} style={{ color: "var(--fail)", flexShrink: 0, marginTop: 1 }}/>
            )}
            <div style={{
              fontSize: "var(--fs-sm)",
              lineHeight: 1.6,
              color: isError ? "var(--fail)" : "var(--fg-1)",
              whiteSpace: "pre-wrap",
              flex: 1,
              minWidth: 0,
              wordBreak: "break-word",
            }}>
              {opts.message}
            </div>
          </div>
        )}
      </Modal>
    </Context.Provider>
  );
}
