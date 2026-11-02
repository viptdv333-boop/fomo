/* Editing an own chat message in the main composer: the draft save / restore state machine, the submit plan, the banner quote, the composer parts.
   Run: npx tsx scripts/check-chat-edit.ts   (exit code 1 on a failed assertion) */
import { beginEdit, composerParts, editQuote, endEdit, idleEdit, planSubmit } from "../src/lib/chat-edit";

export {}; // a module: the other check scripts declare the same top-level names

let fails = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

type D = { text: string };

// draft save / restore
const s0 = idleEdit<D>();
eq("idle: not editing, no draft", s0, { editingId: null, draft: null });
const s1 = beginEdit(s0, "m1", { text: "half-written" });
eq("begin: remembers the composer draft", s1, { editingId: "m1", draft: { text: "half-written" } });
const s2 = beginEdit(s1, "m2", { text: "text of m1 being edited" });
eq("switching to another message keeps the ORIGINAL draft", s2, { editingId: "m2", draft: { text: "half-written" } });
const e1 = endEdit(s2);
eq("end: idle + the original draft comes back", e1, { state: { editingId: null, draft: null }, restore: { text: "half-written" } });
eq("end while idle: nothing to restore", endEdit(s0).restore, null);
eq("empty composer before the edit: restores the empty draft (not null)", endEdit(beginEdit(s0, "m1", { text: "" })).restore, { text: "" });
eq("begin does not mutate the old state", s1.editingId, "m1");

// submit plan
eq("submit: empty text does nothing", planSubmit("hello", "   \n "), { kind: "empty" });
eq("submit: untouched text is a plain cancel", planSubmit("hello", "hello"), { kind: "unchanged" });
eq("submit: untouched modulo outer whitespace is a cancel", planSubmit("hello ", " hello"), { kind: "unchanged" });
eq("submit: changed text is saved trimmed", planSubmit("hello", "  hello world \n"), { kind: "save", text: "hello world" });
eq("submit: multi-line keeps inner newlines", planSubmit("a", "a\nb"), { kind: "save", text: "a\nb" });

// banner quote
eq("quote: short text as is", editQuote("hi there"), "hi there");
eq("quote: newlines and runs of spaces collapse", editQuote("a\n\n  b   c"), "a b c");
eq("quote: long text is cut with an ellipsis", editQuote("x".repeat(200), 10), "xxxxxxxxx…");

// composer parts
const slugs = new Set(["btc", "eth"]);
eq("parts: plain text", composerParts("hello", slugs), [{ k: "text", v: "hello" }]);
eq("parts: newlines become br", composerParts("a\nb", slugs), [{ k: "text", v: "a" }, { k: "br" }, { k: "text", v: "b" }]);
eq("parts: a custom emoji becomes an emoji part", composerParts("x :btc: y", slugs), [{ k: "text", v: "x " }, { k: "emoji", v: ":btc:" }, { k: "text", v: " y" }]);
eq("parts: an unknown :word: stays text", composerParts("see :foo: ok", slugs), [{ k: "text", v: "see :foo: ok" }]);
eq("parts: CRLF is one line break", composerParts("a\r\nb", slugs), [{ k: "text", v: "a" }, { k: "br" }, { k: "text", v: "b" }]);
eq("parts: blank line in the middle", composerParts("a\n\nb", slugs), [{ k: "text", v: "a" }, { k: "br" }, { k: "br" }, { k: "text", v: "b" }]);
eq("parts: empty text has no parts", composerParts("", slugs), []);
// round trip like getInputText(): text / emoji / br back to the string
const rt = (t: string) => composerParts(t, slugs).map((p) => (p.k === "br" ? "\n" : p.v)).join("");
eq("parts: round trip", rt("a :eth:\n\nb :btc::eth: :nope:"), "a :eth:\n\nb :btc::eth: :nope:");

if (fails) {
  console.log(`\n${fails} FAILED`);
  process.exit(1);
}
console.log("\nall ok");
