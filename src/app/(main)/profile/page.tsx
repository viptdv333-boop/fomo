"use client";

import { useSession } from "next-auth/react";
import { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import TariffManager from "@/components/profile/TariffManager";
import FinanceTab from "@/components/profile/FinanceTab";
import ShareButtons from "@/components/shared/ShareButtons";

const SPECIALIZATION_OPTIONS = [
  { value: "trader", label: "Трейдер" },
  { value: "analyst", label: "Аналитик" },
  { value: "investor", label: "Инвестор" },
  { value: "scalper", label: "Скальпер" },
  { value: "algotrader", label: "Алготрейдер" },
];

interface EducationRecord {
  id: string;
  university: string;
  faculty: string;
  specialty: string;
  yearEnd: number | null;
}

export default function MyProfilePage() {
  return (
    <Suspense fallback={<div className="text-center py-8">Загрузка...</div>}>
      <ProfileContent />
    </Suspense>
  );
}

function ProfileContent() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const [displayName, setDisplayName] = useState("");
  const [fomoId, setFomoId] = useState("");
  const [fomoIdError, setFomoIdError] = useState("");
  const [bio, setBio] = useState("");
  const [subscriptionPrice, setSubscriptionPrice] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [city, setCity] = useState("");
  const [workplace, setWorkplace] = useState("");
  const [exchangeExperience, setExchangeExperience] = useState("");
  const [specializations, setSpecializations] = useState<string[]>([]);
  const [education, setEducation] = useState<EducationRecord[]>([]);
  const [dmEnabled, setDmEnabled] = useState(true);
  const [paymentCard, setPaymentCard] = useState("");
  const [donationCard, setDonationCard] = useState("");
  const [socialLinks, setSocialLinks] = useState({
    telegram: "",
    vk: "",
    youtube: "",
    whatsapp: "",
    max: "",
    website: "",
  });
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  // Education form
  const [eduUniversity, setEduUniversity] = useState("");
  const [eduFaculty, setEduFaculty] = useState("");
  const [eduSpecialty, setEduSpecialty] = useState("");
  const [eduYearEnd, setEduYearEnd] = useState("");
  const [showEduForm, setShowEduForm] = useState(false);
  const [rating, setRating] = useState(0);
  const tabParam = searchParams.get("tab");
  const initialTab = tabParam === "finance" ? "finance" : tabParam === "security" ? "security" : "profile";
  const [activeTab, setActiveTab] = useState<"profile" | "finance" | "security">(initialTab);

  // Security tab state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [securityMessage, setSecurityMessage] = useState("");
  const [securityError, setSecurityError] = useState("");
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [emailStep, setEmailStep] = useState<"form" | "code">("form");
  const [emailCode, setEmailCode] = useState("");
  const [emailSending, setEmailSending] = useState(false);

  useEffect(() => {
    if (session?.user?.id) {
      fetch(`/api/users/${session.user.id}`)
        .then((r) => r.json())
        .then((data) => {
          setDisplayName(data.displayName || "");
          setFomoId(data.fomoId || "");
          setBio(data.bio || "");
          setSubscriptionPrice(data.subscriptionPrice ? String(data.subscriptionPrice) : "");
          setFirstName(data.firstName || "");
          setLastName(data.lastName || "");
          setBirthDate(data.birthDate ? data.birthDate.slice(0, 10) : "");
          setCity(data.city || "");
          setWorkplace(data.workplace || "");
          setExchangeExperience(data.exchangeExperience || "");
          setSpecializations(data.specializations || []);
          setEducation(data.education || []);
          setAvatarUrl(data.avatarUrl || null);
          setDmEnabled(data.dmEnabled ?? true);
          setPaymentCard(data.paymentCard || "");
          setDonationCard(data.donationCard || "");
          setRating(Number(data.rating) || 0);
          if (data.socialLinks) {
            setSocialLinks({
              telegram: data.socialLinks.telegram || "",
              vk: data.socialLinks.vk || "",
              youtube: data.socialLinks.youtube || "",
              whatsapp: data.socialLinks.whatsapp || "",
              max: data.socialLinks.max || "",
              website: data.socialLinks.website || "",
            });
          }
        });
    }
  }, [session]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    const res = await fetch(`/api/users/${session?.user?.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: [firstName, lastName].filter(Boolean).join(" ") || displayName,
        ...(fomoId && { fomoId }),
        bio,
        subscriptionPrice: subscriptionPrice ? Number(subscriptionPrice) : null,
        firstName: firstName || null,
        lastName: lastName || null,
        birthDate: birthDate || null,
        city: city || null,
        workplace: workplace || null,
        exchangeExperience: exchangeExperience || null,
        specializations,
        dmEnabled,
        paymentCard: paymentCard || null,
        donationCard: donationCard || null,
        socialLinks: Object.values(socialLinks).some(Boolean) ? socialLinks : null,
      }),
    });

    setLoading(false);
    if (res.ok) {
      setMessage("Профиль обновлён");
    } else {
      setMessage("Ошибка сохранения");
    }
  }

  function toggleSpecialization(value: string) {
    setSpecializations((prev) =>
      prev.includes(value) ? prev.filter((s) => s !== value) : [...prev, value]
    );
  }

  async function addEducation(e?: React.FormEvent | React.MouseEvent) {
    e?.preventDefault();
    if (!eduUniversity.trim()) return;
    const res = await fetch(`/api/users/${session?.user?.id}/education`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        university: eduUniversity,
        faculty: eduFaculty || undefined,
        specialty: eduSpecialty || undefined,
        yearEnd: eduYearEnd ? Number(eduYearEnd) : undefined,
      }),
    });
    if (res.ok) {
      const record = await res.json();
      setEducation((prev) => [record, ...prev]);
      setEduUniversity("");
      setEduFaculty("");
      setEduSpecialty("");
      setEduYearEnd("");
      setShowEduForm(false);
    }
  }

  async function deleteEducation(educationId: string) {
    const res = await fetch(
      `/api/users/${session?.user?.id}/education?educationId=${educationId}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      setEducation((prev) => prev.filter((e) => e.id !== educationId));
    }
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    // Show local preview immediately
    const localPreview = URL.createObjectURL(file);
    setAvatarUrl(localPreview);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("type", "avatars");
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (res.ok) {
        const data = await res.json();
        if (data.url) {
          // Save avatar URL to user profile
          const patchRes = await fetch(`/api/users/${session?.user?.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ avatarUrl: data.url }),
          });
          if (patchRes.ok) {
            // Keep showing local preview (blob URL) — it's already visible
            // Server URL will be used on next page load
          }
        }
      } else {
        const err = await res.json().catch(() => ({}));
        console.error("Upload failed:", err);
        setMessage("Ошибка загрузки аватара: " + (err.error || "неизвестная ошибка"));
      }
    } catch (err) {
      console.error("Avatar upload error:", err);
      setMessage("Ошибка загрузки аватара");
    }
    setAvatarUploading(false);
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-4 dark:text-gray-100">Мой профиль</h1>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
        <button
          onClick={() => setActiveTab("profile")}
          className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition ${
            activeTab === "profile"
              ? "bg-white dark:bg-gray-900 shadow text-gray-900 dark:text-gray-100"
              : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          }`}
        >
          Профиль
        </button>
        <button
          onClick={() => setActiveTab("finance")}
          className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition ${
            activeTab === "finance"
              ? "bg-white dark:bg-gray-900 shadow text-gray-900 dark:text-gray-100"
              : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          }`}
        >
          Финансы
        </button>
        <button
          onClick={() => setActiveTab("security")}
          className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition ${
            activeTab === "security"
              ? "bg-white dark:bg-gray-900 shadow text-gray-900 dark:text-gray-100"
              : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          }`}
        >
          Безопасность
        </button>
      </div>

      {activeTab === "finance" && session?.user?.id && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-6">
            <FinanceTab userId={session.user.id} />
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-6">
            <TariffManager userId={session.user.id} rating={rating} />
          </div>
        </div>
      )}

      {activeTab === "profile" && (
      <>
      {/* Avatar */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-4 sm:p-6 mb-6 flex flex-col sm:flex-row items-center gap-4">
        <div
          className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center text-green-600 font-bold text-3xl overflow-hidden cursor-pointer relative"
          onClick={() => avatarInputRef.current?.click()}
        >
          {avatarUrl ? (
            <>
              <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
              {avatarUploading && (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                  <span className="text-white text-xs">...</span>
                </div>
              )}
            </>
          ) : avatarUploading ? (
            <span className="text-sm text-gray-400">...</span>
          ) : (
            displayName?.[0] || "?"
          )}
        </div>
        <div>
          <button
            type="button"
            onClick={() => avatarInputRef.current?.click()}
            className="text-green-600 hover:text-green-800 text-sm font-medium"
          >
            {avatarUrl ? "Изменить фото" : "Загрузить фото"}
          </button>
          <p className="text-xs text-gray-500 mt-1">JPG, PNG или WebP, до 2 МБ</p>
        </div>
        <input
          ref={avatarInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleAvatarUpload}
          className="hidden"
        />
      </div>

      <form onSubmit={handleSave} className="bg-white dark:bg-gray-900 rounded-xl shadow p-4 sm:p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Имя</label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-full px-4 py-2 border dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-green-500 dark:bg-gray-800 dark:text-gray-100"
              placeholder="Алексей"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Фамилия</label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="w-full px-4 py-2 border dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-green-500 dark:bg-gray-800 dark:text-gray-100"
              placeholder="Иванов"
            />
          </div>
        </div>

        {/* Email — read-only, change on Security tab */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
          <div className="flex items-center gap-2">
            <input
              type="email"
              value={session?.user?.email || ""}
              readOnly
              className="w-full px-4 py-2 border dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50 dark:text-gray-400 text-gray-500 cursor-not-allowed"
            />
            <button
              type="button"
              onClick={() => setActiveTab("security")}
              className="text-xs text-green-600 hover:text-green-700 whitespace-nowrap shrink-0"
            >
              Изменить
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">FOMO ID</label>
          <div className="flex items-center gap-2">
            <span className="text-gray-400 dark:text-gray-500 text-lg font-mono">#</span>
            <input
              type="text"
              value={fomoId}
              onChange={(e) => {
                const val = e.target.value.replace(/[^a-zA-Z0-9_!?$%]/g, "").slice(0, 33);
                setFomoId(val);
                setFomoIdError("");
              }}
              className="flex-1 px-4 py-2 border dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-green-500 bg-white dark:bg-gray-800 dark:text-gray-100 font-mono"
              placeholder="my_unique_id"
              maxLength={33}
            />
          </div>
          {fomoIdError && <p className="text-xs text-red-500 mt-1">{fomoIdError}</p>}
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Латинские буквы, цифры и символы _ ! ? $ % — от 7 до 33 символов
          </p>
          {/* Personal page link */}
          {session?.user?.id && (
            <div className="flex items-center gap-2 mt-2">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Моя страница: <span className="font-mono text-green-600 dark:text-green-400">fomo.broker/profile/{fomoId || session.user.id}</span>
              </p>
              <ShareButtons
                url={`https://fomo.broker/profile/${fomoId || session.user.id}`}
                text={`${[firstName, lastName].filter(Boolean).join(" ") || displayName || "Профиль"} на FOMO`}
              />
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Дата рождения</label>
            <input
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              className="w-full px-4 py-2 border dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-green-500 dark:bg-gray-800 dark:text-gray-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Город</label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full px-4 py-2 border dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-green-500 dark:bg-gray-800 dark:text-gray-100"
              placeholder="Москва"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Место работы</label>
          <input
            type="text"
            value={workplace}
            onChange={(e) => setWorkplace(e.target.value)}
            className="w-full px-4 py-2 border dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-green-500 dark:bg-gray-800 dark:text-gray-100"
            placeholder="Компания или 'Частный трейдер'"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Опыт на бирже</label>
          <input
            type="text"
            value={exchangeExperience}
            onChange={(e) => setExchangeExperience(e.target.value)}
            className="w-full px-4 py-2 border dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-green-500 dark:bg-gray-800 dark:text-gray-100"
            placeholder="3 года, 10+ лет"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Специализация</label>
          <div className="flex flex-wrap gap-2">
            {SPECIALIZATION_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer text-sm transition ${
                  specializations.includes(opt.value)
                    ? "bg-green-50 dark:bg-green-900/30 border-green-300 dark:border-green-700 text-green-700 dark:text-green-300"
                    : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                }`}
              >
                <input
                  type="checkbox"
                  checked={specializations.includes(opt.value)}
                  onChange={() => toggleSpecialization(opt.value)}
                  className="sr-only"
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">О себе</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            className="w-full px-4 py-2 border dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-green-500 dark:bg-gray-800 dark:text-gray-100"
            placeholder="Расскажите о себе и своём опыте..."
          />
        </div>

        {/* Social links */}
        <div className="border-t dark:border-gray-700 pt-4">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Соцсети и мессенджеры</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Telegram</label>
              <input
                type="text"
                value={socialLinks.telegram}
                onChange={(e) => setSocialLinks({ ...socialLinks, telegram: e.target.value })}
                className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg text-sm focus:ring-2 focus:ring-green-500 dark:bg-gray-800 dark:text-gray-100"
                placeholder="@username или ссылка"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">VK</label>
              <input
                type="text"
                value={socialLinks.vk}
                onChange={(e) => setSocialLinks({ ...socialLinks, vk: e.target.value })}
                className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg text-sm focus:ring-2 focus:ring-green-500 dark:bg-gray-800 dark:text-gray-100"
                placeholder="https://vk.com/..."
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">YouTube</label>
              <input
                type="text"
                value={socialLinks.youtube}
                onChange={(e) => setSocialLinks({ ...socialLinks, youtube: e.target.value })}
                className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg text-sm focus:ring-2 focus:ring-green-500 dark:bg-gray-800 dark:text-gray-100"
                placeholder="https://youtube.com/..."
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">WhatsApp</label>
              <input
                type="text"
                value={socialLinks.whatsapp}
                onChange={(e) => setSocialLinks({ ...socialLinks, whatsapp: e.target.value })}
                className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg text-sm focus:ring-2 focus:ring-green-500 dark:bg-gray-800 dark:text-gray-100"
                placeholder="+7 999 123-45-67"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">MAX</label>
              <input
                type="text"
                value={socialLinks.max}
                onChange={(e) => setSocialLinks({ ...socialLinks, max: e.target.value })}
                className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg text-sm focus:ring-2 focus:ring-green-500 dark:bg-gray-800 dark:text-gray-100"
                placeholder="Ссылка на профиль"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Сайт</label>
              <input
                type="text"
                value={socialLinks.website}
                onChange={(e) => setSocialLinks({ ...socialLinks, website: e.target.value })}
                className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg text-sm focus:ring-2 focus:ring-green-500 dark:bg-gray-800 dark:text-gray-100"
                placeholder="https://..."
              />
            </div>
          </div>
        </div>

        {/* Education section */}
        <div className="border-t dark:border-gray-700 pt-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Образование</h3>
            <button
              type="button"
              onClick={() => setShowEduForm(!showEduForm)}
              className="text-green-600 hover:text-green-800 text-sm font-medium"
            >
              {showEduForm ? "Отмена" : "+ Добавить"}
            </button>
          </div>

          {showEduForm && (
            <div className="border dark:border-gray-700 rounded-lg p-4 mb-3 bg-gray-50 dark:bg-gray-800 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ВУЗ *</label>
                <input
                  type="text"
                  value={eduUniversity}
                  onChange={(e) => setEduUniversity(e.target.value)}
                  className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg text-sm focus:ring-2 focus:ring-green-500 dark:bg-gray-800 dark:text-gray-100"
                  placeholder="МГУ им. Ломоносова"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Факультет</label>
                  <input
                    type="text"
                    value={eduFaculty}
                    onChange={(e) => setEduFaculty(e.target.value)}
                    className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg text-sm focus:ring-2 focus:ring-green-500 dark:bg-gray-800 dark:text-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Специальность</label>
                  <input
                    type="text"
                    value={eduSpecialty}
                    onChange={(e) => setEduSpecialty(e.target.value)}
                    className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg text-sm focus:ring-2 focus:ring-green-500 dark:bg-gray-800 dark:text-gray-100"
                  />
                </div>
              </div>
              <div className="flex items-end gap-3">
                <div className="w-32">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Год окончания</label>
                  <input
                    type="number"
                    value={eduYearEnd}
                    onChange={(e) => setEduYearEnd(e.target.value)}
                    min="1950"
                    max="2050"
                    className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg text-sm focus:ring-2 focus:ring-green-500 dark:bg-gray-800 dark:text-gray-100"
                  />
                </div>
                <button
                  type="button"
                  onClick={addEducation}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition"
                >
                  Добавить
                </button>
              </div>
            </div>
          )}

          {education.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-sm">Нет записей об образовании</p>
          ) : (
            <div className="space-y-3">
              {education.map((edu) => (
                <div key={edu.id} className="flex items-start justify-between border dark:border-gray-700 rounded-lg p-3">
                  <div>
                    <div className="font-medium text-sm">{edu.university}</div>
                    {edu.faculty && <div className="text-sm text-gray-600 dark:text-gray-400">{edu.faculty}</div>}
                    {edu.specialty && <div className="text-sm text-gray-500 dark:text-gray-400">{edu.specialty}</div>}
                    {edu.yearEnd && <div className="text-xs text-gray-400 mt-1">Выпуск {edu.yearEnd}</div>}
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteEducation(edu.id)}
                    className="text-red-500 hover:text-red-700 text-xs"
                  >
                    Удалить
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Donation card */}
        <div className="border-t dark:border-gray-700 pt-4">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Карта для донатов</h3>
          <input
            type="text"
            value={donationCard}
            onChange={(e) => setDonationCard(e.target.value)}
            className="w-full px-4 py-2 border dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-green-500 dark:bg-gray-800 dark:text-gray-100"
            placeholder="0000 0000 0000 0000"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Укажите номер карты для получения донатов от читателей ваших бесплатных идей
          </p>
        </div>

        {/* DM toggle */}
        <div className="border-t dark:border-gray-700 pt-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={dmEnabled}
              onChange={(e) => setDmEnabled(e.target.checked)}
              className="w-4 h-4 text-green-600 rounded focus:ring-green-500"
            />
            <div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Разрешить личные сообщения</span>
              <p className="text-xs text-gray-500 dark:text-gray-400">Другие пользователи смогут писать вам в мессенджер</p>
            </div>
          </label>
        </div>

        <div className="flex items-center gap-4 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="bg-green-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-green-700 transition disabled:opacity-50"
          >
            {loading ? "Сохранение..." : "Сохранить"}
          </button>
          {message && (
            <span className={message.includes("Ошибка") ? "text-red-600" : "text-green-600"}>
              {message}
            </span>
          )}
        </div>
      </form>
      </>
      )}

      {activeTab === "security" && (
        <div className="space-y-6">
          {/* Change Password */}
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-6">
            <h3 className="text-lg font-bold dark:text-gray-100 mb-4">Смена пароля</h3>
            <form onSubmit={async (e) => {
              e.preventDefault();
              setSecurityMessage(""); setSecurityError("");
              if (newPassword !== confirmPassword) { setSecurityError("Пароли не совпадают"); return; }
              const res = await fetch("/api/auth/change-password", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ currentPassword, newPassword }),
              });
              const data = await res.json();
              if (res.ok) { setSecurityMessage(data.message); setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); }
              else setSecurityError(data.error);
            }} className="space-y-4">
              {[
                { key: "cur", label: "Текущий пароль", value: currentPassword, set: setCurrentPassword, required: true },
                { key: "new", label: "Новый пароль", value: newPassword, set: setNewPassword, required: true, minLength: 6 },
                { key: "conf", label: "Подтвердите пароль", value: confirmPassword, set: setConfirmPassword, required: true },
              ].map((f) => (
                <div key={f.key}>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{f.label}</label>
                  <div className="relative">
                    <input type={showPasswords[f.key] ? "text" : "password"} value={f.value} onChange={(e) => f.set(e.target.value)} required={f.required} minLength={f.minLength} className="w-full px-3 py-2 pr-10 border dark:border-gray-700 rounded-lg text-sm dark:bg-gray-800 dark:text-gray-100" />
                    <button type="button" onClick={() => setShowPasswords(p => ({ ...p, [f.key]: !p[f.key] }))} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                      {showPasswords[f.key] ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      )}
                    </button>
                  </div>
                </div>
              ))}
              <div className="flex items-center gap-3">
                <button type="submit" className="bg-green-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition">Сменить пароль</button>
                {securityMessage && <span className="text-green-600 text-sm">{securityMessage}</span>}
                {securityError && <span className="text-red-600 text-sm">{securityError}</span>}
              </div>
            </form>
          </div>

          {/* Change Email — 2-step: send code → verify */}
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-6">
            <h3 className="text-lg font-bold dark:text-gray-100 mb-4">Смена email</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Текущий: {session?.user?.email || "—"}</p>

            {emailStep === "form" ? (
              <form onSubmit={async (e) => {
                e.preventDefault();
                setSecurityMessage(""); setSecurityError(""); setEmailSending(true);
                const res = await fetch("/api/auth/change-email", {
                  method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "send-code", newEmail, password: emailPassword }),
                });
                const data = await res.json();
                setEmailSending(false);
                if (res.ok) { setSecurityMessage(data.message); setEmailStep("code"); }
                else setSecurityError(data.error);
              }} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Новый email</label>
                  <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg text-sm dark:bg-gray-800 dark:text-gray-100" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Текущий пароль</label>
                  <div className="relative">
                    <input type={showPasswords["email"] ? "text" : "password"} value={emailPassword} onChange={(e) => setEmailPassword(e.target.value)} required className="w-full px-3 py-2 pr-10 border dark:border-gray-700 rounded-lg text-sm dark:bg-gray-800 dark:text-gray-100" />
                    <button type="button" onClick={() => setShowPasswords(p => ({ ...p, email: !p.email }))} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                      {showPasswords["email"] ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      )}
                    </button>
                  </div>
                </div>
                <button type="submit" disabled={emailSending} className="bg-green-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition disabled:opacity-50">
                  {emailSending ? "Отправка кода..." : "Отправить код подтверждения"}
                </button>
              </form>
            ) : (
              <form onSubmit={async (e) => {
                e.preventDefault();
                setSecurityMessage(""); setSecurityError(""); setEmailSending(true);
                const res = await fetch("/api/auth/change-email", {
                  method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "verify", newEmail, code: emailCode }),
                });
                const data = await res.json();
                setEmailSending(false);
                if (res.ok) {
                  setSecurityMessage(data.message);
                  setNewEmail(""); setEmailPassword(""); setEmailCode(""); setEmailStep("form");
                } else setSecurityError(data.error);
              }} className="space-y-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Код отправлен на <span className="font-medium text-gray-900 dark:text-gray-100">{newEmail}</span>
                </p>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Код подтверждения</label>
                  <input type="text" value={emailCode} onChange={(e) => setEmailCode(e.target.value)} required maxLength={6} placeholder="123456" className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg text-sm dark:bg-gray-800 dark:text-gray-100 text-center text-lg tracking-widest font-mono" />
                </div>
                <div className="flex items-center gap-3">
                  <button type="submit" disabled={emailSending} className="bg-green-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition disabled:opacity-50">
                    {emailSending ? "Проверка..." : "Подтвердить"}
                  </button>
                  <button type="button" onClick={() => { setEmailStep("form"); setEmailCode(""); setSecurityError(""); }} className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                    Назад
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
