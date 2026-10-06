import type { DlPlatform } from "@/lib/downloads";

// Platform glyphs for the "Download the app" blocks, 24x24 viewBox, crisp from 12 to 40 px.
// Default: one colour (currentColor), used in the profile list and the menus. `colored` gives the brand colours for the
// landing pages: Android = green robot head, Windows = the four coloured panes, Apple (macOS / iPhone) = the apple in
// currentColor (the caller sets it light on dark and near-black on light, so it is readable on both themes).

const APPLE =
  "M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701";

const ANDROID =
  "M17.523 15.3414c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.5511 0 .9993.4483.9993.9993.0001.5511-.4482.9997-.9993.9997m-11.046 0c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.5511 0 .9993.4483.9993.9993 0 .5511-.4483.9997-.9993.9997m11.4045-6.02l1.9973-3.4592a.416.416 0 00-.1521-.5676.416.416 0 00-.5676.1521l-2.0223 3.503C15.5902 8.2439 13.8533 7.8508 12 7.8508s-3.5902.3931-5.1367 1.0989L4.841 5.4467a.4161.4161 0 00-.5677-.1521.4157.4157 0 00-.1521.5676l1.9973 3.4592C2.6889 11.1867.3432 14.6589 0 18.761h24c-.3435-4.1021-2.6892-7.5743-6.1185-9.4396";

/** The one-colour Windows mark (slanted panes) of the monochrome set. */
const WINDOWS_MONO = "M2.5 3.5l8.6-1.2v8.4H2.5zM12.2 2.1l9.3-1.3v9.9h-9.3zM2.5 11.8h8.6v8.4l-8.6-1.2zM12.2 11.8h9.3v10.1l-9.3-1.3z";

const MONO: Record<DlPlatform, string> = { android: ANDROID, windows: WINDOWS_MONO, macos: APPLE, ios: APPLE };

export const ANDROID_GREEN = "#3DDC84";
export const WINDOWS_PANES = { tl: "#F25022", tr: "#7FBA00", bl: "#00A4EF", br: "#FFB900" } as const;

export default function PlatformIcon({ platform, size = 24, className, colored = false }: { platform: DlPlatform; size?: number; className?: string; colored?: boolean }) {
  const svg = { xmlns: "http://www.w3.org/2000/svg", width: size, height: size, viewBox: "0 0 24 24", "aria-hidden": true, focusable: "false" as const, className };
  if (colored && platform === "windows") {
    return (
      <svg {...svg}>
        <rect x="2" y="2" width="9.4" height="9.4" rx="1.1" fill={WINDOWS_PANES.tl} />
        <rect x="12.6" y="2" width="9.4" height="9.4" rx="1.1" fill={WINDOWS_PANES.tr} />
        <rect x="2" y="12.6" width="9.4" height="9.4" rx="1.1" fill={WINDOWS_PANES.bl} />
        <rect x="12.6" y="12.6" width="9.4" height="9.4" rx="1.1" fill={WINDOWS_PANES.br} />
      </svg>
    );
  }
  const fill = colored && platform === "android" ? ANDROID_GREEN : "currentColor";
  return (
    <svg {...svg} fill={fill}>
      <path d={MONO[platform]} />
    </svg>
  );
}
