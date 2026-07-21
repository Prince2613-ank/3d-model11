// Toolbar panels (notifications, my complaints, …) share the same fixed
// screen position, so opening one must close the others or they'd stack on
// top of each other. Panels register a close callback here instead of
// importing each other directly.
type CloseFn = () => void;

const panels = new Map<string, CloseFn>();

export function registerToolbarPanel(name: string, close: CloseFn): void {
  panels.set(name, close);
}

export function closeOtherToolbarPanels(exceptName: string): void {
  for (const [name, close] of panels) {
    if (name !== exceptName) close();
  }
}
