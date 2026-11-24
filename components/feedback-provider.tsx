"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

type NoticeKind = "success" | "error" | "info";
type ConfirmOptions = { title: string; description: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean };
type FeedbackApi = { notify: (message: string, kind?: NoticeKind, title?: string) => void; confirm: (options: ConfirmOptions) => Promise<boolean> };
type Notice = { id: number; message: string; kind: NoticeKind; title: string };
const FeedbackContext = createContext<FeedbackApi | null>(null);

export function useFeedback() {
  const value = useContext(FeedbackContext);
  if (!value) throw new Error("useFeedback must be used inside FeedbackProvider.");
  return value;
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [notice, setNotice] = useState<Notice | null>(null);
  const [dialog, setDialog] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);
  const sequence = useRef(0);

  const notify = useCallback((message: string, kind: NoticeKind = "success", title?: string) => {
    sequence.current += 1;
    setNotice({ id: sequence.current, message, kind, title: title || (kind === "success" ? "All done" : kind === "error" ? "Something needs attention" : "A note from Lens & Light") });
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(current => current?.id === notice.id ? null : current), 4800);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!dialog) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDialog(null);
        resolver.current?.(false);
        resolver.current = null;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dialog]);

  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => {
    if (resolver.current) resolver.current(false);
    resolver.current = resolve;
    setDialog(options);
  }), []);

  const finishConfirm = (accepted: boolean) => {
    setDialog(null);
    resolver.current?.(accepted);
    resolver.current = null;
  };

  return (
    <FeedbackContext.Provider value={{ notify, confirm }}>
      {children}
      {notice && <div className={`ll-toast ll-toast-${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"} aria-live={notice.kind === "error" ? "assertive" : "polite"}>
        <span className="ll-toast-icon">{notice.kind === "success" ? <CheckCircle2 size={21}/> : notice.kind === "error" ? <AlertCircle size={21}/> : <Info size={21}/>}</span>
        <span className="ll-toast-copy"><strong>{notice.title}</strong><span>{notice.message}</span></span>
        <button type="button" className="ll-toast-close" aria-label="Dismiss notification" onClick={() => setNotice(null)}><X size={17}/></button>
      </div>}
      {dialog && <div className="ll-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) finishConfirm(false); }}>
        <section className="ll-dialog" role="alertdialog" aria-modal="true" aria-labelledby="ll-dialog-title" aria-describedby="ll-dialog-description">
          <span className={`ll-dialog-symbol ${dialog.danger ? "is-danger" : ""}`}>{dialog.danger ? <AlertCircle size={23}/> : <Info size={23}/>}</span>
          <p className="ll-dialog-eyebrow">LENS &amp; LIGHT · CONFIRMATION</p>
          <h2 id="ll-dialog-title">{dialog.title}</h2>
          <p id="ll-dialog-description">{dialog.description}</p>
          <div className="ll-dialog-actions">
            <button type="button" className="ll-dialog-cancel" onClick={() => finishConfirm(false)}>{dialog.cancelLabel || "Cancel"}</button>
            <button type="button" className={`ll-dialog-confirm ${dialog.danger ? "is-danger" : ""}`} onClick={() => finishConfirm(true)}>{dialog.confirmLabel || "Confirm"}</button>
          </div>
        </section>
      </div>}
    </FeedbackContext.Provider>
  );
}
