/* Tool hotkeys, TradingView style: Alt + letter picks a tool. Alt+A stays reserved for "alert at cursor".
   Codes are physical keys (KeyboardEvent.code) so they work on any keyboard layout, including Russian. */

export interface ToolHotkey {
  code: string;
  tool: string;
  /** Shown in tooltips, e.g. "Alt+T". */
  label: string;
}

const H = (letter: string, tool: string): ToolHotkey => ({ code: `Key${letter}`, tool, label: `Alt+${letter}` });

export const TOOL_HOTKEYS: ToolHotkey[] = [
  H("T", "trend"),
  H("H", "hline"),
  H("J", "hray"),
  H("V", "vline"),
  H("C", "crossline"),
  H("F", "fib_retr"),
  H("I", "info"),
  H("R", "rect"),
  H("E", "ellipse"),
  H("B", "brush"),
  H("L", "long"),
  H("S", "short"),
  H("M", "measure"),
  H("P", "pitchfork"),
];

const BY_CODE = new Map(TOOL_HOTKEYS.map((h) => [h.code, h]));
const BY_TOOL = new Map(TOOL_HOTKEYS.map((h) => [h.tool, h]));

export function toolForHotkey(ev: { code: string; altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }): string | null {
  // Ctrl+Alt is AltGr on many Windows layouts, Shift+Alt switches the keyboard layout: leave both alone
  if (!ev.altKey || ev.ctrlKey || ev.metaKey || ev.shiftKey) return null;
  return BY_CODE.get(ev.code)?.tool ?? null;
}

/** "Alt+T" for a tool, or null when it has no hotkey. */
export function hotkeyLabel(tool: string): string | null {
  return BY_TOOL.get(tool)?.label ?? null;
}
