"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useT } from "@/lib/i18n/client";

interface Preview {
  id: string;
  name: string;
  description: string | null;
  ownerName: string | null;
  membersCount: number;
  alreadyMember: boolean;
}

export default function JoinRoomPage() {
  const { t } = useT();
  const params = useParams();
  const router = useRouter();
  const { data: session, status } = useSession();
  const token = params.token as string;

  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated") { setLoading(false); return; }

    fetch(`/api/rooms/join/${token}`)
      .then(async (r) => {
        if (!r.ok) { setNotFound(true); return; }
        setPreview(await r.json());
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [token, status]);

  async function handleJoin() {
    setJoining(true);
    setError("");
    const res = await fetch(`/api/rooms/join/${token}`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      router.push(`/rooms/${data.roomId}`);
    } else {
      const data = await res.json();
      setError(data.error || t("chat2.joinFailed"));
      setJoining(false);
    }
  }

  if (status === "loading" || loading) {
    return <div className="text-center py-16 text-gray-500 dark:text-gray-400">{t("common.loading")}</div>;
  }

  if (status === "unauthenticated") {
    return (
      <div className="max-w-sm mx-auto text-center py-16">
        <div className="text-4xl mb-3">🔒</div>
        <h1 className="text-lg font-semibold mb-2 dark:text-gray-100">{t("chat2.loginRequired")}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          {t("chat2.loginToJoinHint")}
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link
            href={`/login?callbackUrl=${encodeURIComponent(`/rooms/join/${token}`)}`}
            className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition"
          >
            {t("nav.login")}
          </Link>
          <Link
            href={`/register?callbackUrl=${encodeURIComponent(`/rooms/join/${token}`)}`}
            className="text-green-600 hover:underline text-sm"
          >
            {t("chat2.register")}
          </Link>
        </div>
      </div>
    );
  }

  if (notFound || !preview) {
    return (
      <div className="max-w-sm mx-auto text-center py-16">
        <h1 className="text-lg font-semibold mb-2 dark:text-gray-100">{t("chat2.linkInvalid")}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t("chat2.linkInvalidHint")}
        </p>
      </div>
    );
  }

  if (preview.alreadyMember) {
    return (
      <div className="max-w-sm mx-auto text-center py-16">
        <h1 className="text-lg font-semibold mb-2 dark:text-gray-100">{t("chat2.alreadyMember")}</h1>
        <Link
          href={`/rooms/${preview.id}`}
          className="inline-block bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition"
        >
          {t("chat2.openGroup")}
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-sm mx-auto text-center py-16">
      <div className="text-4xl mb-3">💬</div>
      <h1 className="text-lg font-semibold mb-1 dark:text-gray-100">{preview.name}</h1>
      {preview.description && (
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">{preview.description}</p>
      )}
      <p className="text-xs text-gray-400 mb-6">
        {preview.ownerName && <>{t("chat2.ownerLabel", { name: preview.ownerName })} · </>}
        👥 {t("chat2.membersCount", { count: preview.membersCount })}
      </p>
      {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
      <button
        onClick={handleJoin}
        disabled={joining}
        className="bg-green-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-green-700 transition disabled:opacity-50"
      >
        {joining ? t("chat2.joining") : t("chat2.join")}
      </button>
    </div>
  );
}
