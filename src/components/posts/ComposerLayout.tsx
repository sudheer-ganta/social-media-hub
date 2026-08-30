import React from "react";

interface ComposerLayoutProps {
  children: React.ReactNode;
}

export function ComposerLayout({ children }: ComposerLayoutProps) {
  return (
    <div className="grid gap-4 items-start xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_420px]">
      {children}
    </div>
  );
}
