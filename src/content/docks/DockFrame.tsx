import React, { forwardRef } from "react";

type DockFrameProps = React.HTMLAttributes<HTMLElement> & {
  top: React.ReactNode;
  bottom: React.ReactNode;
};

export const DockFrame = forwardRef<HTMLElement, DockFrameProps>(
  function DockFrame({ top, bottom, children, className = "", ...props }, ref) {
    return (
      <aside ref={ref} {...props} className={["justsnap-rail", className].filter(Boolean).join(" ")}>
        <div className="justsnap-rail-control-slot">{top}</div>
        <DockSeparator />
        {children}
        <DockSeparator />
        {bottom}
      </aside>
    );
  }
);

function DockSeparator() {
  return (
    <div className="justsnap-rail-separator-slot">
      <div className="justsnap-rail-separator" />
    </div>
  );
}
