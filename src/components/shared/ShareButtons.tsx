"use client";

import { useState } from "react";

interface ShareButtonsProps {
  url: string;
  text: string;
}

const TelegramIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <rect width="24" height="24" rx="12" fill="#26A5E4"/>
    <path d="M7.5 12.5l2.2 1.6 1.3 3.9 2-2 2.8 2 2.2-10-12 4.5z" fill="#fff"/>
    <path d="M9.7 14.1l-.2 3.4 1.5-1.5" fill="#D2E4F0"/>
    <path d="M9.7 14.1l5.5-3.6-4.2 4.6" fill="#B5CFE4"/>
  </svg>
);

const WhatsAppIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <rect width="24" height="24" rx="12" fill="#25D366"/>
    <path d="M12 4C7.6 4 4 7.6 4 12c0 1.4.4 2.8 1 4l-.7 2.6L7 17.9c1.1.6 2.4 1 3.7 1.1h.3c4.4 0 8-3.6 8-8s-3.6-8-8-8zm4.6 11.2c-.2.6-1.2 1.1-1.6 1.2-.4 0-.9.2-3-1-2.5-1.4-4-4-4.2-4.2-.1-.2-1-1.4-1-2.6 0-1.2.7-1.8.9-2 .2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5.2.5.8 1.9.8 2 .1.1 0 .4-.1.5-.1.2-.2.3-.4.5-.2.2-.3.3-.5.5-.2.2-.4.4-.2.7.2.4.9 1.5 2 2.4 1.3 1.1 2.4 1.5 2.8 1.7.3.1.5.1.7-.1.2-.2.8-1 1-1.3.2-.3.4-.3.7-.2.3.1 1.7.8 2 1 .3.1.5.2.6.3.1.2.1.8-.1 1.4z" fill="#fff"/>
  </svg>
);

const MaxIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <rect width="24" height="24" rx="12" fill="#FF8C00"/>
    <text x="12" y="16" textAnchor="middle" fill="#fff" fontSize="10" fontWeight="bold" fontFamily="Arial">M</text>
  </svg>
);

const WeChatIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <rect width="24" height="24" rx="12" fill="#07C160"/>
    <path d="M9.5 7C7 7 5 8.8 5 11c0 1.2.6 2.3 1.6 3l-.4 1.5 1.7-1c.5.2 1 .3 1.6.3.2 0 .3 0 .5 0-.1-.3-.1-.7-.1-1 0-2.5 2.2-4.5 5-4.5.2 0 .4 0 .6 0C15.2 8 12.6 7 9.5 7z" fill="#fff"/>
    <circle cx="8" cy="10" r=".7" fill="#07C160"/>
    <circle cx="11" cy="10" r=".7" fill="#07C160"/>
    <path d="M19.5 13.8c0-2-2-3.5-4.5-3.5s-4.5 1.5-4.5 3.5 2 3.5 4.5 3.5c.5 0 1-.1 1.4-.2l1.3.7-.3-1.2c1.2-.7 2.1-1.7 2.1-2.8z" fill="#fff"/>
    <circle cx="13.5" cy="13.5" r=".5" fill="#07C160"/>
    <circle cx="16.5" cy="13.5" r=".5" fill="#07C160"/>
  </svg>
);

const EmailIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <rect width="24" height="24" rx="12" fill="#6366F1"/>
    <rect x="5" y="8" width="14" height="9" rx="1.5" stroke="#fff" strokeWidth="1.5" fill="none"/>
    <path d="M5 9.5l7 4.5 7-4.5" stroke="#fff" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
  </svg>
);

const CopyIcon = ({ copied }: { copied: boolean }) =>
  copied ? (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-500"><polyline points="20 6 9 17 4 12"/></svg>
  ) : (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
  );

const ShareIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/></svg>
);

const SHARE_TARGETS = [
  {
    id: "telegram",
    label: "Telegram",
    Icon: TelegramIcon,
    urlFn: (url: string, text: string) =>
      `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
  },
  {
    id: "whatsapp",
    label: "WhatsApp",
    Icon: WhatsAppIcon,
    urlFn: (url: string, text: string) =>
      `https://wa.me/?text=${encodeURIComponent(text + " " + url)}`,
  },
  {
    id: "max",
    label: "MAX",
    Icon: MaxIcon,
    urlFn: (url: string, text: string) =>
      `https://connect.ok.ru/offer?url=${encodeURIComponent(url)}&title=${encodeURIComponent(text)}`,
  },
  {
    id: "wechat",
    label: "WeChat",
    Icon: WeChatIcon,
    urlFn: (url: string) =>
      `weixin://dl/business/?ticket=${encodeURIComponent(url)}`,
  },
  {
    id: "email",
    label: "Почта",
    Icon: EmailIcon,
    urlFn: (url: string, text: string) =>
      `mailto:?subject=${encodeURIComponent(text)}&body=${encodeURIComponent(url)}`,
  },
];

export default function ShareButtons({ url, text }: ShareButtonsProps) {
  const [copied, setCopied] = useState(false);
  const [showShare, setShowShare] = useState(false);

  async function copyLink() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex items-center gap-1 relative">
      {/* Copy button */}
      <button
        onClick={copyLink}
        className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition"
        title="Скопировать ссылку"
      >
        <CopyIcon copied={copied} />
      </button>
      {/* Share button */}
      <button
        onClick={() => setShowShare(!showShare)}
        className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition"
        title="Поделиться"
      >
        <ShareIcon />
      </button>
      {/* Share dropdown */}
      {showShare && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setShowShare(false)} />
          <div className="absolute top-7 right-0 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg shadow-lg py-1 z-20 min-w-[180px]">
            {SHARE_TARGETS.map((t) => (
              <a
                key={t.id}
                href={t.urlFn(url, text)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setShowShare(false)}
                className="flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
              >
                <t.Icon />
                {t.label}
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
