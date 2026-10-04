/* "Оплата по ссылке": URL validator (src/lib/payment-link.ts) used by both client and server.
   Run: npx tsx scripts/check-payment-link.ts   (exit code 1 on a failed assertion) */
import {
  hasLinkRef,
  isLinkRef,
  linkRef,
  linkRefId,
  normalizeLinkDetails,
  paymentLinkHost,
  sanitizeInstruction,
  validatePaymentLink,
} from "../src/lib/payment-link";

let fails = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}
const code = (u: unknown) => {
  const r = validatePaymentLink(u);
  return r.ok ? "OK" : r.code;
};

// ---- accepted: typical services ----
const good = [
  "https://yoomoney.ru/to/4100111111111111",
  "https://yoomoney.ru/quickpay/confirm?receiver=4100111&sum=100&quickpay-form=shop",
  "https://www.tbank.ru/cf/AbCdEf123",
  "https://www.tinkoff.ru/cf/AbCdEf123",
  "https://qr.nspk.ru/AS1A0000ABCDEFGH?type=01&bank=100000000111",
  "https://pay.cloudtips.ru/p/abcdef12",
  "https://boosty.to/someauthor/donate",
  "https://donate.stream/author",
  "https://www.donationalerts.com/r/author",
  "https://donatty.com/author",
  "https://payform.ru/abc123/",
  "https://auth.robokassa.ru/Merchant/Index.aspx?MerchantLogin=x",
  "https://pay.cloudpayments.ru/?id=1",
  "https://www.paypal.me/author/10USD",
  "https://buy.stripe.com/test_abc123",
  "https://t.me/wallet",
  "https://ko-fi.com/author",
  "https://пример.рф/pay",
  "HTTPS://YooMoney.RU/Pay",
  "  https://yoomoney.ru/pay  ",
];
for (const u of good) eq(`accept ${u.trim()}`, code(u), "OK");

// ---- rejected ----
const bad: Array<[string, unknown, string]> = [
  ["empty", "", "empty"],
  ["blank", "   ", "empty"],
  ["undefined", undefined, "invalid"],
  ["number", 42, "invalid"],
  ["object", { u: 1 }, "invalid"],
  ["no scheme", "yoomoney.ru/pay", "invalid"],
  ["http", "http://yoomoney.ru/pay", "not_https"],
  ["javascript:", "javascript:alert(1)", "not_https"],
  ["JaVaScRiPt:", "JaVaScRiPt:alert(1)", "not_https"],
  ["data:", "data:text/html,<script>alert(1)</script>", "not_https"],
  ["file:", "file:///etc/passwd", "not_https"],
  ["ftp:", "ftp://example.com/x", "not_https"],
  ["tg:", "tg://resolve?domain=wallet", "not_https"],
  ["protocol-relative", "//yoomoney.ru/pay", "invalid"],
  ["credentials user:pass", "https://user:pass@yoomoney.ru/pay", "credentials"],
  ["credentials user only", "https://user@yoomoney.ru/pay", "credentials"],
  ["credentials spoof host", "https://yoomoney.ru@evil.example.com/pay", "credentials"],
  ["localhost", "https://localhost/pay", "private_host"],
  ["localhost:port", "https://localhost:3000/pay", "bad_port"],
  ["sub.localhost", "https://pay.localhost/x", "private_host"],
  ["*.local", "https://printer.local/x", "private_host"],
  ["*.internal", "https://svc.internal/x", "private_host"],
  ["ipv4 public", "https://8.8.8.8/pay", "private_host"],
  ["ipv4 loopback", "https://127.0.0.1/pay", "private_host"],
  ["ipv4 10/8", "https://10.0.0.5/pay", "private_host"],
  ["ipv4 172.16/12", "https://172.16.4.4/pay", "private_host"],
  ["ipv4 192.168/16", "https://192.168.1.1/pay", "private_host"],
  ["ipv4 metadata", "https://169.254.169.254/latest/meta-data", "private_host"],
  ["ipv4 decimal", "https://2130706433/pay", "private_host"],
  ["ipv4 hex", "https://0x7f000001/pay", "private_host"],
  ["ipv4 octal-ish", "https://0177.0.0.1/pay", "private_host"],
  ["ipv4 short", "https://127.1/pay", "private_host"],
  ["ipv6 loopback", "https://[::1]/pay", "private_host"],
  ["ipv6 mapped", "https://[::ffff:127.0.0.1]/pay", "private_host"],
  ["ipv6 public", "https://[2001:4860:4860::8888]/pay", "private_host"],
  ["single label host", "https://intranet/pay", "bad_host"],
  ["numeric tld", "https://example.123/pay", "invalid"],
  ["non-standard port", "https://yoomoney.ru:8443/pay", "bad_port"],
  ["whitespace inside", "https://yoomoney.ru/pa y", "invalid"],
  ["newline inside", "https://yoomoney.ru/pay\nhttps://evil.com", "invalid"],
  ["tab inside", "https://yoomoney.ru/\tpay", "invalid"],
  ["too long", "https://yoomoney.ru/" + "a".repeat(500), "too_long"],
];
for (const [name, v, want] of bad) eq(`reject ${name}`, code(v), want);

// exactly 500 chars is fine, 501 is not
eq("length 500 ok", code("https://yoomoney.ru/" + "a".repeat(500 - "https://yoomoney.ru/".length)), "OK");
eq("length 501 rejected", code("https://yoomoney.ru/" + "a".repeat(501 - "https://yoomoney.ru/".length)), "too_long");

// ---- normalisation / host ----
{
  const r = validatePaymentLink("  HTTPS://WWW.YooMoney.RU/Pay?x=1#top ");
  eq("normalised url", r.ok && r.url, "https://www.yoomoney.ru/Pay?x=1#top");
  eq("host drops www", r.ok && r.host, "yoomoney.ru");
}
eq("host default port", paymentLinkHost("https://pay.example.com:443/x"), "pay.example.com");
eq("host of garbage", paymentLinkHost("not a url"), "");
eq("host of non-string", paymentLinkHost(null), "");

// ---- instruction ----
eq("instruction trims", sanitizeInstruction("  В комментарии укажите ник  "), "В комментарии укажите ник");
eq("instruction strips control chars", sanitizeInstruction("a\u0000b\u0007c‮d"), "abcd");
eq("instruction keeps newline", sanitizeInstruction("a\r\nb"), "a\nb");
eq("instruction collapses blank lines", sanitizeInstruction("a\n\n\n\n\nb"), "a\n\nb");
eq("instruction non-string", sanitizeInstruction(123), "");

// ---- details (what the API stores) ----
{
  const r = normalizeLinkDetails({ url: "https://yoomoney.ru/pay", instruction: "  ник  ", extra: "<script>", secret: "x" });
  eq("details canonical shape", r.ok && r.details, { url: "https://yoomoney.ru/pay", instruction: "ник" });
}
eq("details without instruction", (() => { const r = normalizeLinkDetails({ url: "https://yoomoney.ru/pay" }); return r.ok && r.details; })(), { url: "https://yoomoney.ru/pay" });
eq("details instruction 300 ok", normalizeLinkDetails({ url: "https://yoomoney.ru/pay", instruction: "x".repeat(300) }).ok, true);
eq("details instruction 301 rejected", (() => { const r = normalizeLinkDetails({ url: "https://yoomoney.ru/pay", instruction: "x".repeat(301) }); return r.ok ? "OK" : r.code; })(), "instruction_too_long");
eq("details bad url", (() => { const r = normalizeLinkDetails({ url: "javascript:alert(1)" }); return r.ok ? "OK" : r.code; })(), "not_https");
eq("details null", (() => { const r = normalizeLinkDetails(null); return r.ok ? "OK" : r.code; })(), "invalid");
eq("details missing url", (() => { const r = normalizeLinkDetails({}); return r.ok ? "OK" : r.code; })(), "invalid");

// ---- tariff.paymentMethods refs ----
eq("isLinkRef bare", isLinkRef("link"), true);
eq("isLinkRef id", isLinkRef("link:ck12_ab-Z"), true);
eq("isLinkRef rejects card", isLinkRef("card"), false);
eq("isLinkRef rejects junk", isLinkRef("link:"), false);
eq("isLinkRef rejects injection", isLinkRef("link:../../x"), false);
eq("isLinkRef rejects non-string", isLinkRef(5), false);
eq("linkRefId bare = all", linkRefId("link"), null);
eq("linkRefId id", linkRefId("link:abc"), "abc");
eq("linkRefId non-link", linkRefId("sbp"), undefined);
eq("linkRef round trip", linkRefId(linkRef("xyz")), "xyz");
eq("hasLinkRef true", hasLinkRef(["card", "link:abc"]), true);
eq("hasLinkRef false", hasLinkRef(["card", "sbp"]), false);
eq("hasLinkRef null", hasLinkRef(null), false);

console.log(fails === 0 ? "\nAll checks passed" : `\n${fails} check(s) FAILED`);
process.exit(fails === 0 ? 0 : 1);
