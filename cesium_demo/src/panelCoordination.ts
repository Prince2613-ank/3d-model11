// Toolbar panels (notifications, my complaints, …) share the same fixed
// screen position, so opening one must close the others or they'd stack on
// top of each other. Panels register a close callback here instead of
// importing each other directly.
type CloseFn = () => void;
type OpenFn = () => void;

const panels = new Map<string, CloseFn>();
const openers = new Map<string, OpenFn>();

export function registerToolbarPanel(name: string, close: CloseFn): void {
  panels.set(name, close);
}

export function closeOtherToolbarPanels(exceptName: string): void {
  for (const [name, close] of panels) {
    if (name !== exceptName) close();
  }
}

// Lets one panel switch to another (e.g. the notifications panel's "Help"
// button opening the My Complaints panel in its place) without the two
// panel modules importing each other directly.
export function registerPanelOpener(name: string, open: OpenFn): void {
  openers.set(name, open);
}

export function openToolbarPanel(name: string): void {
  openers.get(name)?.();
}
