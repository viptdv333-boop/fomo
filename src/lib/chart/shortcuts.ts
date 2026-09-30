/**
 * Hotkeys of the terminal chart, shown in the keyboard shortcuts dialog (press "?").
 *
 * Other modules append their own entries to SHORTCUTS (keep entries in the group order below):
 *   SHORTCUTS.push({ group: "drawing", keys: ["Alt", "H"], text: "shortcuts.drawHline" })
 * `text` is an i18n key (add it to your own dict file); `keys` are the key caps shown in order.
 * A "/" inside `keys` is drawn as "or" between alternatives, e.g. ["+", "/", "-"] is not needed:
 * write two entries or one key cap like "+ / -".
 */

export type ShortcutGroup = "general" | "navigation" | "drawing" | "alerts" | "chart";

export interface ShortcutItem {
  group: ShortcutGroup;
  /** Key caps, in order of pressing, e.g. ["Ctrl", "Z"]. */
  keys: string[];
  /** i18n key with the description. */
  text: string;
}

export const SHORTCUT_GROUPS: { id: ShortcutGroup; key: string }[] = [
  { id: "general", key: "shortcuts.group.general" },
  { id: "navigation", key: "shortcuts.group.navigation" },
  { id: "chart", key: "shortcuts.group.chart" },
  { id: "drawing", key: "shortcuts.group.drawing" },
  { id: "alerts", key: "shortcuts.group.alerts" },
];

export const SHORTCUTS: ShortcutItem[] = [
  { group: "general", keys: ["?"], text: "shortcuts.help" },
  { group: "general", keys: ["Esc"], text: "shortcuts.esc" },
  { group: "general", keys: ["Ctrl", "Z"], text: "shortcuts.undo" },
  { group: "general", keys: ["Ctrl", "Y"], text: "shortcuts.redo" },
  { group: "general", keys: ["Del"], text: "shortcuts.delete" },

  { group: "navigation", keys: ["+"], text: "shortcuts.zoomIn" },
  { group: "navigation", keys: ["-"], text: "shortcuts.zoomOut" },
  { group: "navigation", keys: ["←"], text: "shortcuts.scrollLeft" },
  { group: "navigation", keys: ["→"], text: "shortcuts.scrollRight" },
  { group: "navigation", keys: ["Shift", "←"], text: "shortcuts.scrollLeftFast" },
  { group: "navigation", keys: ["Shift", "→"], text: "shortcuts.scrollRightFast" },
  { group: "navigation", keys: ["End"], text: "shortcuts.toLatest" },
  { group: "navigation", keys: ["Home"], text: "shortcuts.toFirst" },
  { group: "navigation", keys: ["Alt", "R"], text: "shortcuts.resetView" },
  { group: "navigation", keys: ["Shift", "Wheel"], text: "shortcuts.wheelScroll" },
  { group: "navigation", keys: ["Ctrl", "Wheel"], text: "shortcuts.wheelZoomFine" },

  { group: "chart", keys: ["Alt", "G"], text: "shortcuts.goToDate" },
  { group: "chart", keys: ["Alt", "P"], text: "shortcuts.settings" },
  { group: "chart", keys: ["Alt", "S"], text: "shortcuts.snapshot" },
  { group: "chart", keys: ["Shift", "F"], text: "shortcuts.fullscreen" },

  { group: "alerts", keys: ["Alt", "A"], text: "shortcuts.alert" },
];
