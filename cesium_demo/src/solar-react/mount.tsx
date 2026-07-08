import { createRoot } from "react-dom/client";
import { SolarWorkspace } from "./SolarWorkspace";

export function mountSolarWorkspace(): void {
  const container = document.createElement("div");
  container.id = "solarWorkspaceRoot";
  document.body.appendChild(container);
  createRoot(container).render(<SolarWorkspace />);
}
