"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import IdeaCard from "@/components/ideas/IdeaCard";
import BuySubscriptionModal from "@/components/profile/BuySubscriptionModal";
import WatchlistWidget from "@/components/profile/WatchlistWidget";

const SPECIALIZATION_LABELS: Record<string, string> = {
  trader: "Трейдер",
  analyst: "Аналитик",
  investor: "Инвестор",
  scalper: "Скальпер",
  algotrader: "Алготрейдер",
};

interface EducationRecord {
  id: string;
  university: string;
  faculty: string | null;
  specialty: string | null;
  yearEnd: number | null;
}

interface AuthorProfile {
  id: string;
  displayName: string;
  fomoId: string | null;
  bio: string | null;
  avatarUrl: string | null;
  rating: number;
  firstName: string | null;
  lastName: string | null;
  birthDate: string | null;
  city: string | null;
  workplace: string | null;
  exchangeExperience: string | null;
  specializations: string[];
  dmEnabled: boolean;
  socialLinks: {
    telegram?: string;
    vk?: string;
    youtube?: string;
    whatsapp?: string;
    max?: string;
    website?: string;
  } | null;
  education: EducationRecord[];
  createdAt: string;
  followerCount: number;
  ideaCount: number;
  isFollowing?: boolean;
}

function calcAge(birthDate: string): number {
  const birth = new Date(birthDate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

export default function AuthorProfilePage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const [profile, setProfile] = useState<AuthorProfile | null>(null);
  const [ideas, setIdeas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBuyModal, setShowBuyModal] = useState(false);
  const [hasTariffs, setHasTariffs] = useState(false);

  async function loadProfile() {
    const res = await fetch(`/api/users/${params.userId}`);
    if (res.ok) setProfile(await res.json());
  }

  async function loadIdeas() {
    const res = await fetch(`/api/ideas?authorId=${params.userId}`);
    const data = await res.json();
    setIdeas(data.data || data.ideas || (Array.isArray(data) ? data : []));
    setLoading(false);
  }

  async function checkTariffs() {
    try {
      const res = await fetch(`/api/users/${params.userId}/tariffs`);
      if (res.ok) {
        const data = await res.json();
        setHasTariffs(Array.isArray(data) && data.length > 0);
      }
    } catch {}
  }

  useEffect(() => {
    loadProfile();
    loadIdeas();
    checkTariffs();
  }, [params.userId]);

  async function toggleFollow() {
    if (!session) return;
    const res = await fetch(`/api/users/${params.userId}/follow`, {
      method: "POST",
    });
    if (res.ok) {
      loadProfile();
    }
  }

  if (loading) return <div className="text-gray-500 py-12 text-center">Загрузка...</div>;
  if (!profile) return <div className="text-gray-500 py-12 text-center">Пользователь не найден</div>;

  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(" ");

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-8 mb-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center text-green-600 dark:text-green-400 font-bold text-2xl overflow-hidden">
              {profile.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                profile.displayName[0]
              )}
            </div>
            <div>
              <h1 className="text-2xl font-bold">{profile.displayName}</h1>
              {profile.fomoId && (
                <div className="text-gray-400 dark:text-gray-500 text-sm font-mono">#{profile.fomoId}</div>
              )}
              {fullName && fullName !== profile.displayName && (
                <div className="text-gray-600 dark:text-gray-400 text-sm">{fullName}</div>
              )}
              <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400 mt-1">
                <span>Рейтинг: <strong className="text-gray-700 dark:text-gray-300">{Number(profile.rating).toFixed(1)}</strong></span>
                <span>·</span>
                <span>{profile.followerCount} подписчиков</span>
                <span>·</span>
                <span>{profile.ideaCount} идей</span>
              </div>
              {profile.bio && (
                <p className="text-gray-600 dark:text-gray-400 mt-2">{profile.bio}</p>
              )}
            </div>
          </div>

          {session && session.user.id !== profile.id && (
            <div className="flex items-center gap-2">
              {profile.dmEnabled && (
                <button
                  onClick={async () => {
                    const res = await fetch("/api/messages/conversations", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ userId: profile.id }),
                    });
                    if (res.ok) {
                      const data = await res.json();
                      router.push(`/messages?conversation=${data.id}`);
                    }
                  }}
                  className="px-4 py-2 rounded-lg text-sm font-medium border border-green-600 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 transition"
                >
                  Написать
                </button>
              )}
              <button
                onClick={toggleFollow}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  profile.isFollowing
                    ? "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                    : "bg-green-600 text-white hover:bg-green-700"
                }`}
              >
                {profile.isFollowing ? "Отписаться" : "Подписаться"}
              </button>
              {hasTariffs && (
                <button
                  onClick={() => setShowBuyModal(true)}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-amber-500 text-white hover:bg-amber-600 transition"
                >
                  Купить подписку
                </button>
              )}
            </div>
          )}
        </div>

        {/* Specializations */}
        {profile.specializations.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4">
            {profile.specializations.map((spec) => (
              <span
                key={spec}
                className="px-2.5 py-1 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full text-xs font-medium"
              >
                {SPECIALIZATION_LABELS[spec] || spec}
              </span>
            ))}
          </div>
        )}

        {/* Details grid */}
        {(profile.city || profile.birthDate || profile.workplace || profile.exchangeExperience) && (
          <div className="mt-4 pt-4 border-t dark:border-gray-700 grid grid-cols-2 gap-3 text-sm">
            {profile.city && (
              <div>
                <span className="text-gray-500 dark:text-gray-400">Город: </span>
                <span className="text-gray-700 dark:text-gray-300">{profile.city}</span>
              </div>
            )}
            {profile.birthDate && (
              <div>
                <span className="text-gray-500 dark:text-gray-400">Возраст: </span>
                <span className="text-gray-700 dark:text-gray-300">{calcAge(profile.birthDate)} лет</span>
              </div>
            )}
            {profile.workplace && (
              <div>
                <span className="text-gray-500 dark:text-gray-400">Работа: </span>
                <span className="text-gray-700 dark:text-gray-300">{profile.workplace}</span>
              </div>
            )}
            {profile.exchangeExperience && (
              <div>
                <span className="text-gray-500 dark:text-gray-400">Опыт на бирже: </span>
                <span className="text-gray-700 dark:text-gray-300">{profile.exchangeExperience}</span>
              </div>
            )}
          </div>
        )}

        {/* Education */}
        {profile.education && profile.education.length > 0 && (
          <div className="mt-4 pt-4 border-t dark:border-gray-700">
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-2">Образование</h3>
            <div className="space-y-2">
              {profile.education.map((edu) => (
                <div key={edu.id} className="text-sm">
                  <div className="font-medium text-gray-700 dark:text-gray-300">{edu.university}</div>
                  {edu.faculty && <div className="text-gray-500">{edu.faculty}</div>}
                  {edu.specialty && <div className="text-gray-500">{edu.specialty}</div>}
                  {edu.yearEnd && <div className="text-gray-400 text-xs">Выпуск {edu.yearEnd}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Social links */}
        {profile.socialLinks && Object.values(profile.socialLinks).some(Boolean) && (
          <div className="mt-4 pt-4 border-t dark:border-gray-700">
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-2">Соцсети</h3>
            <div className="flex flex-wrap gap-2">
              {profile.socialLinks.telegram && (
                <a href={profile.socialLinks.telegram.startsWith("http") ? profile.socialLinks.telegram : `https://t.me/${profile.socialLinks.telegram.replace("@", "")}`}
                  target="_blank" rel="noopener noreferrer"
                  className="px-3 py-1 bg-green-50 text-green-700 rounded-full text-xs font-medium hover:bg-green-100 transition">
                  Telegram
                </a>
              )}
              {profile.socialLinks.vk && (
                <a href={profile.socialLinks.vk.startsWith("http") ? profile.socialLinks.vk : `https://vk.com/${profile.socialLinks.vk}`}
                  target="_blank" rel="noopener noreferrer"
                  className="px-3 py-1 bg-green-50 text-green-700 rounded-full text-xs font-medium hover:bg-green-100 transition">
                  VK
                </a>
              )}
              {profile.socialLinks.youtube && (
                <a href={profile.socialLinks.youtube.startsWith("http") ? profile.socialLinks.youtube : `https://youtube.com/${profile.socialLinks.youtube}`}
                  target="_blank" rel="noopener noreferrer"
                  className="px-3 py-1 bg-red-50 text-red-700 rounded-full text-xs font-medium hover:bg-red-100 transition">
                  YouTube
                </a>
              )}
              {profile.socialLinks.whatsapp && (
                <a href={`https://wa.me/${profile.socialLinks.whatsapp.replace(/[^0-9+]/g, "")}`}
                  target="_blank" rel="noopener noreferrer"
                  className="px-3 py-1 bg-green-50 text-green-700 rounded-full text-xs font-medium hover:bg-green-100 transition">
                  WhatsApp
                </a>
              )}
              {profile.socialLinks.max && (
                <a href={profile.socialLinks.max.startsWith("http") ? profile.socialLinks.max : `https://max.ru/${profile.socialLinks.max}`}
                  target="_blank" rel="noopener noreferrer"
                  className="px-3 py-1 bg-green-50 text-green-700 rounded-full text-xs font-medium hover:bg-green-100 transition">
                  MAX
                </a>
              )}
              {profile.socialLinks.website && (
                <a href={profile.socialLinks.website.startsWith("http") ? profile.socialLinks.website : `https://${profile.socialLinks.website}`}
                  target="_blank" rel="noopener noreferrer"
                  className="px-3 py-1 bg-green-50 text-green-700 rounded-full text-xs font-medium hover:bg-green-100 transition">
                  Сайт
                </a>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Watchlist */}
      <div className="mb-6">
        <WatchlistWidget />
      </div>

      <h2 className="text-lg font-semibold mb-4 dark:text-gray-100">Идеи автора</h2>
      {ideas.length === 0 ? (
        <div className="text-gray-500 dark:text-gray-400 text-center py-8">Нет идей</div>
      ) : (
        <div className="space-y-4">
          {ideas.map((idea: any) => (
            <IdeaCard key={idea.id} idea={idea} onVote={loadIdeas} />
          ))}
        </div>
      )}

      {showBuyModal && profile && (
        <BuySubscriptionModal
          authorId={profile.id}
          authorName={profile.displayName}
          onClose={() => setShowBuyModal(false)}
        />
      )}
    </div>
  );
}
