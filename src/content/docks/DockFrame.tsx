import React from "react";

type DockFrameProps = React.HTMLAttributes<HTMLElement> & {
  top: React.ReactNode;
  bottom: React.ReactNode;
};

export function DockFrame({ top, bottom, children, className = "", ...props }: DockFrameProps) {
  return (
    <aside {...props} className={["justsnap-rail", className].filter(Boolean).join(" ")}>
      <div className="justsnap-rail-control-slot">{top}</div>
      <DockSeparator />
      {children}
      <DockSeparator />
      {bottom}
    </aside>
  );
}

function DockSeparator() {
  return (
    <div className="justsnap-rail-separator-slot">
      <div className="justsnap-rail-separator" />
    </div>
  );
}
