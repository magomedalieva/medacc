import type { PlanEventItem } from "../types/api";

function haveSameSignature(left: PlanEventItem, right: PlanEventItem): boolean {
  return (
    left.event_type === right.event_type &&
    left.tone === right.tone &&
    left.title === right.title &&
    left.description === right.description
  );
}

export function collapseRepeatedPlanEvents(items: PlanEventItem[]): PlanEventItem[] {
  return items.reduce<PlanEventItem[]>((uniqueItems, item) => {
    const previousItem = uniqueItems.at(-1);

    if (previousItem && haveSameSignature(previousItem, item)) {
      return uniqueItems;
    }

    return [...uniqueItems, item];
  }, []);
}
