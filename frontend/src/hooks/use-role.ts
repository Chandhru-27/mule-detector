import { useState, useCallback } from "react";

export type Role = "regulator" | "developer";

export const roleLabels: Record<Role, string> = {
  regulator: "RBI / Regulator",
  developer: "System health monitor",
};

export function useRole() {
  const [role, setRole] = useState<Role>("regulator");
  const switchRole = useCallback((r: Role) => setRole(r), []);
  return { role, switchRole };
}
