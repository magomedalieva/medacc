import type { ReactNode } from "react";

import { StudentTopNav } from "./StudentTopNav";

interface TestsChromeProps {
  children: ReactNode;
  activeKey?: "dashboard" | "tests" | "osce" | "analytics" | "practice";
}

export function TestsChrome({ children, activeKey = "tests" }: TestsChromeProps) {
  void activeKey;

  return (
    <>
      <StudentTopNav />
      {children}
    </>
  );
}
