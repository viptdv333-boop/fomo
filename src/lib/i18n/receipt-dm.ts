// The receipt DM goes to the seller, not the buyer, so it is always written in
// the site's base language. Kept tiny on purpose: the payment modal is a client
// component and must not pull the full dictionaries into the bundle.
const RECEIPT_DM: Record<string, string> = {
  "pay.dmDonation": "💰 Донат{amount}\n\nЧек об оплате прикреплён. Спасибо!",
  "pay.dmIdea": "💳 Оплата идеи «{title}» — {price} ₽\n\nЧек об оплате прикреплён. Пожалуйста, подтвердите получение.",
  "pay.dmSubscription": "💳 Оплата подписки «{title}» — {price} ₽\n\nЧек об оплате прикреплён. Пожалуйста, подтвердите получение.",
  "pay.dmCourse": "💳 Оплата курса «{title}» — {price} ₽\n\nЧек об оплате прикреплён. Пожалуйста, подтвердите получение.",
  "pay.receiptFileName": "чек_оплаты.png",
};

export function receiptDmText(key: string, vars: Record<string, string | number> = {}): string {
  let s = RECEIPT_DM[key] ?? key;
  for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}
