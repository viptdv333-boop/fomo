// Turns bare URLs inside plain user text into clickable links, without
// touching anything else — the text still renders as plain text otherwise
// (no markdown/HTML), so this can't be used to inject markup.
const URL_RE = /(https?:\/\/[^\s<>"')\]]+)/g;

export default function Linkify({
  text,
  linkClassName = "text-green-600 dark:text-green-400 hover:underline break-all",
}: {
  text: string;
  /** Override when the surrounding background makes the default green unreadable (e.g. a green chat bubble). */
  linkClassName?: string;
}) {
  // A capturing-group split alternates [text, url, text, url, ..., text] —
  // odd indices are always the captured URLs, so no separate regex.test()
  // call (and its lastIndex-statefulness footgun on a shared `g` regex) is
  // needed to tell them apart.
  const parts = text.split(URL_RE);
  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 0) return part;
        // Trailing punctuation right after a URL (a period ending the
        // sentence, a closing bracket) reads as part of the link visually
        // but almost never belongs in it — strip it off before linking.
        const trailMatch = part.match(/[.,!?;:]+$/);
        const trail = trailMatch ? trailMatch[0] : "";
        const href = trail ? part.slice(0, -trail.length) : part;
        return (
          <span key={i}>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              onClick={(e) => e.stopPropagation()}
              className={linkClassName}
            >
              {href}
            </a>
            {trail}
          </span>
        );
      })}
    </>
  );
}
