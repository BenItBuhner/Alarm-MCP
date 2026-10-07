import Link from "next/link";
import type { ReactNode } from "react";
import { Mark } from "./Mark";

export function Shell({
  action,
  children,
  wide = false,
}: {
  action?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "mx-auto max-w-3xl px-6 py-10" : "mx-auto max-w-xl px-6 py-10"}>
      <header className="mb-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 text-paper">
          <span className="text-glow">
            <Mark />
          </span>
          <span className="text-[15px] font-medium tracking-tight">Alarm MCP</span>
        </Link>
        <div className="flex items-center gap-4 text-sm text-mute">{action}</div>
      </header>
      {children}
    </div>
  );
}
