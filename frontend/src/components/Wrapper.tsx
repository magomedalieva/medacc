import type { CSSProperties, ReactNode } from "react";

type Direction = "row" | "column";
type Align = "start" | "center" | "end" | "stretch";
type Justify = "start" | "center" | "end" | "between";
type Layout = "flex" | "grid";

const alignMap: Record<Align, CSSProperties["alignItems"]> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  stretch: "stretch",
};

const justifyMap: Record<Justify, CSSProperties["justifyContent"]> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  between: "space-between",
};

type WrapperProps = {
  children: ReactNode;
  layout?: Layout;
  direction?: Direction;
  gap?: number;
  padding?: number;
  marginTop?: number;
  marginBottom?: number;
  align?: Align;
  justify?: Justify;
  wrap?: boolean;
  columns?: string;
  minItemWidth?: number;
  grow?: boolean;
  width?: "auto" | "full";
  fullWidth?: boolean;
};

export function Wrapper({
  children,
  layout = "flex",
  direction = "column",
  gap = 0,
  padding = 0,
  marginTop = 0,
  marginBottom = 0,
  align = "stretch",
  justify = "start",
  wrap = false,
  columns,
  minItemWidth,
  grow = false,
  width = "auto",
  fullWidth = false,
}: WrapperProps) {
  const style: CSSProperties = {
    display: layout,
    gap,
    padding,
    marginTop,
    marginBottom,
    width: fullWidth || width === "full" ? "100%" : undefined,
    flex: grow ? 1 : undefined,
  };

  if (layout === "grid") {
    style.alignItems = alignMap[align];
    style.justifyContent = justifyMap[justify];
    style.gridTemplateColumns =
      columns ?? (minItemWidth ? `repeat(auto-fit, minmax(${minItemWidth}px, 1fr))` : undefined);
  } else {
    style.flexDirection = direction;
    style.alignItems = alignMap[align];
    style.justifyContent = justifyMap[justify];
    style.flexWrap = wrap ? "wrap" : "nowrap";
  }

  return (
    <div style={style}>{children}</div>
  );
}
