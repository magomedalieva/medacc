import type { ReactNode } from "react";

import { StudentTopNav } from "./StudentTopNav";

interface OsceChromeProps {
  children: ReactNode;
}

export function OsceChrome({ children }: OsceChromeProps) {
  return (
    <>
      <StudentTopNav />
      {children}
    </>
  );
}
