export const MEAL_OPTIONS = [
  { value: "ROOM_ONLY", label: "Room only" },
  { value: "BREAKFAST", label: "Bed & Breakfast" },
  { value: "HALF_BOARD", label: "Half Board" },
  { value: "FULL_BOARD", label: "Full Board" },
  { value: "ALL_INCLUSIVE", label: "All Inclusive" },
] as const;

export type MealValue = (typeof MEAL_OPTIONS)[number]["value"];

const MEAL_BY_VALUE = new Map(MEAL_OPTIONS.map((m) => [m.value, m.label] as const));

export function mealLabel(value: string | null | undefined) {
  if (!value) return "—";
  return MEAL_BY_VALUE.get(value as MealValue) ?? value;
}

export function isValidMeal(value: unknown): value is MealValue {
  return typeof value === "string" && MEAL_BY_VALUE.has(value as MealValue);
}
