// The little picture of a notification type, shared by the site's bell dropdown (NotificationBell) and the app's «Уведомления» list (profile tab). Pure.

/** Emoji of a Notification.type; an unknown type gets the bell. */
export function notifEmoji(type: string): string {
  switch (type) {
    case "new_message": return "💬";
    case "chat_mention": return "📢";
    case "chat_reply": return "↩️";
    case "chat_room_message": return "🔔";
    case "new_follower": return "👤";
    case "new_idea": return "💡";
    case "channel_post": return "📢";
    case "channel_comment": return "💬";
    case "new_comment": return "🗨️";
    case "comment_reply": return "↩️";
    case "idea_like": return "👍";
    case "comment_like": return "❤️";
    case "payment": return "💰";
    case "subscription": return "💰";
    case "subscription_extended": return "🔄";
    case "subscription_removed": return "🚫";
    case "subscription_expiring": return "⏳";
    case "subscription_expired": return "⌛";
    case "room_join": return "👥";
    case "price_alert": return "⏰";
    case "line_alert": return "📈";
    case "calendar_reminder": return "📅";
    case "security": return "🛡️";
    case "report": return "🚩";
    case "broadcast":
    case "email_broadcast": return "📣";
    case "system": return "ℹ️";
    default: return "🔔";
  }
}
