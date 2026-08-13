// Shared fixed-position dock so independent "floating clear" buttons (solar
// heatmap, nearby amenities) line up centered, side by side, instead of each
// owning its own full-width fixed bar and stacking on top of one another.
let dock: HTMLElement | null = null;

export function getFloatingClearDock(): HTMLElement {
  if (dock && document.body.contains(dock)) return dock;
  dock = document.createElement("div");
  dock.id = "floatingClearDock";
  dock.className = "floating-clear-dock";
  document.body.appendChild(dock);
  return dock;
}
