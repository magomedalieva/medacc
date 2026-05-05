import type { ReactNode } from "react";

import { StudentTopNav } from "./StudentTopNav";

interface CasesChromeProps {
  children: ReactNode;
  activeKey?: "dashboard" | "tests" | "cases" | "analytics";
}

export function CasesChrome({ children, activeKey = "cases" }: CasesChromeProps) {
  void activeKey;

  return (
    <>
      <StudentTopNav />
      {children}
    </>
  );
}
