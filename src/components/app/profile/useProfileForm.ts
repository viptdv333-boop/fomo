"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getExistingPushSubscription, isPushSupported, subscribeToPush, unsubscribeFromPush } from "@/lib/push-client";
import { useProf, type MeData } from "./ProfileCtx";

export interface EducationRecord {
  id: string;
  university: string;
  faculty: string | null;
  specialty: string | null;
  yearEnd: number | null;
}

export interface ProfileForm {
  firstName: string;
  lastName: string;
  displayName: string;
  fomoId: string;
  bio: string;
  birthDate: string;
  city: string;
  workplace: string;
  exchangeExperience: string;
  specializations: string[];
  dmEnabled: boolean;
  donationCard: string;
  telegram: string;
  vk: string;
  youtube: string;
  whatsapp: string;
  max: string;
  website: string;
}

function fromMe(m: MeData | null): ProfileForm {
  const s = m?.socialLinks || {};
  return {
    firstName: m?.firstName || "",
    lastName: m?.lastName || "",
    displayName: m?.displayName || "",
    fomoId: m?.fomoId || "",
    bio: m?.bio || "",
    birthDate: m?.birthDate ? String(m.birthDate).slice(0, 10) : "",
    city: m?.city || "",
    workplace: m?.workplace || "",
    exchangeExperience: m?.exchangeExperience || "",
    specializations: m?.specializations || [],
    dmEnabled: m?.dmEnabled ?? true,
    donationCard: m?.donationCard || "",
    telegram: s.telegram || "",
    vk: s.vk || "",
    youtube: s.youtube || "",
    whatsapp: s.whatsapp || "",
    max: s.max || "",
    website: s.website || "",
  };
}

/**
 * State and requests of the «Профиль» (edit) screen: exactly what the old page did (same endpoints, same payload), for the app screen.
 * The form is seeded from the profile record the shell loaded; `dirty` says whether anything differs from it.
 */
export function useProfileForm() {
  const { t, user, me, reloadMe, refreshSession, flash } = useProf();
  const uid = user?.id;
  const [form, setForm] = useState<ProfileForm>(() => fromMe(me));
  const [base, setBase] = useState<ProfileForm>(() => fromMe(me));
  const [education, setEducation] = useState<EducationRecord[]>(me?.education || []);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(me?.avatarUrl || null);
  const [sbpQrUrl, setSbpQrUrl] = useState<string | null>(me?.sbpQrUrl || null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [qrUploading, setQrUploading] = useState(false);
  const seeded = useRef<string | null>(null);

  // seed once per loaded record (not on every reload after a save: the form already shows what was saved)
  useEffect(() => {
    if (!me || seeded.current === me.id) return;
    seeded.current = me.id;
    const f = fromMe(me);
    setForm(f);
    setBase(f);
    setEducation(me.education || []);
    setAvatarUrl(me.avatarUrl || null);
    setSbpQrUrl(me.sbpQrUrl || null);
  }, [me]);

  const set = useCallback(<K extends keyof ProfileForm>(k: K, v: ProfileForm[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setMessage(null);
  }, []);
  const toggleSpec = useCallback((value: string) => {
    setForm((f) => ({ ...f, specializations: f.specializations.includes(value) ? f.specializations.filter((s) => s !== value) : [...f.specializations, value] }));
    setMessage(null);
  }, []);

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(base), [form, base]);

  const save = useCallback(async () => {
    if (!uid || saving) return;
    setSaving(true);
    setMessage(null);
    const socials = { telegram: form.telegram, vk: form.vk, youtube: form.youtube, whatsapp: form.whatsapp, max: form.max, website: form.website };
    try {
      const res = await fetch(`/api/users/${uid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: [form.firstName, form.lastName].filter(Boolean).join(" ") || form.displayName,
          ...(form.fomoId && { fomoId: form.fomoId }),
          bio: form.bio,
          subscriptionPrice: me?.subscriptionPrice ? Number(me.subscriptionPrice) : null,
          firstName: form.firstName || null,
          lastName: form.lastName || null,
          birthDate: form.birthDate || null,
          city: form.city || null,
          workplace: form.workplace || null,
          exchangeExperience: form.exchangeExperience || null,
          specializations: form.specializations,
          dmEnabled: form.dmEnabled,
          paymentCard: me?.paymentCard || null,
          donationCard: form.donationCard || null,
          sbpQrUrl: sbpQrUrl || null,
          socialLinks: Object.values(socials).some(Boolean) ? socials : null,
        }),
      });
      if (res.ok) {
        setBase(form);
        setMessage({ text: t("profile2.saved"), error: false });
        flash(t("profile2.saved"));
        // the header / menus read displayName, fomoId ... off the session, which the JWT only re-reads every 5 min: force it now
        await refreshSession();
        await reloadMe();
      } else {
        const j = await res.json().catch(() => ({}));
        const detail = typeof j?.error === "string" && j.error ? ` (${j.error})` : "";
        setMessage({ text: t("profile2.saveError") + detail, error: true });
      }
    } catch {
      setMessage({ text: t("profile2.saveError"), error: true });
    }
    setSaving(false);
  }, [uid, saving, form, me, sbpQrUrl, t, flash, refreshSession, reloadMe]);

  /* ---- avatar ---- */
  const uploadAvatar = useCallback(
    async (file: File) => {
      if (!uid) return;
      setAvatarUploading(true);
      const preview = URL.createObjectURL(file);
      setAvatarUrl(preview);
      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("type", "avatars");
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        if (res.ok) {
          const data = await res.json();
          if (data.url) {
            const patch = await fetch(`/api/users/${uid}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ avatarUrl: data.url }) });
            if (patch.ok) {
              await refreshSession();
              void reloadMe();
            }
          }
        } else {
          const err = await res.json().catch(() => ({}));
          setMessage({ text: t("profile2.avatarUploadErrorDetail", { error: err.error || t("profile2.errorUnknown") }), error: true });
        }
      } catch {
        setMessage({ text: t("profile2.avatarUploadError"), error: true });
      }
      setAvatarUploading(false);
    },
    [uid, t, refreshSession, reloadMe],
  );

  /* ---- SBP QR ---- */
  const uploadQr = useCallback(
    async (file: File) => {
      if (!uid) return;
      setQrUploading(true);
      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("type", "payment-qr");
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        if (res.ok) {
          const data = await res.json();
          if (data.url) {
            const patch = await fetch(`/api/users/${uid}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sbpQrUrl: data.url }) });
            if (patch.ok) setSbpQrUrl(data.url);
          }
        } else {
          const err = await res.json().catch(() => ({}));
          setMessage({ text: t("profile2.qrUploadErrorDetail", { error: err.error || t("profile2.errorUnknown") }), error: true });
        }
      } catch {
        setMessage({ text: t("profile2.qrUploadError"), error: true });
      }
      setQrUploading(false);
    },
    [uid, t],
  );
  const removeQr = useCallback(async () => {
    if (!uid || !window.confirm(t("profile2.confirmRemoveQr"))) return;
    const res = await fetch(`/api/users/${uid}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sbpQrUrl: null }) });
    if (res.ok) setSbpQrUrl(null);
  }, [uid, t]);

  /* ---- education ---- */
  const addEducation = useCallback(
    async (e: { university: string; faculty: string; specialty: string; yearEnd: string }): Promise<boolean> => {
      if (!uid || !e.university.trim()) return false;
      const res = await fetch(`/api/users/${uid}/education`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          university: e.university,
          faculty: e.faculty || undefined,
          specialty: e.specialty || undefined,
          yearEnd: e.yearEnd ? Number(e.yearEnd) : undefined,
        }),
      });
      if (!res.ok) return false;
      const record = (await res.json()) as EducationRecord;
      setEducation((prev) => [record, ...prev]);
      return true;
    },
    [uid],
  );
  const deleteEducation = useCallback(
    async (id: string) => {
      if (!uid) return;
      const res = await fetch(`/api/users/${uid}/education?educationId=${id}`, { method: "DELETE" });
      if (res.ok) setEducation((prev) => prev.filter((x) => x.id !== id));
    },
    [uid],
  );

  /* ---- web push of this device ---- */
  const [pushSupported, setPushSupported] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState("");
  useEffect(() => {
    if (!isPushSupported()) return;
    setPushSupported(true);
    void getExistingPushSubscription().then((sub) => setPushEnabled(Boolean(sub)));
  }, []);
  const togglePush = useCallback(async () => {
    setPushError("");
    setPushBusy(true);
    try {
      if (pushEnabled) {
        await unsubscribeFromPush();
        setPushEnabled(false);
      } else {
        const result = await subscribeToPush();
        if (result.ok) setPushEnabled(true);
        else if (result.error === "denied") setPushError(t("profile2.pushBlocked"));
        else setPushError(t("profile2.pushFailed", { error: result.error || t("profile2.errorUnknown") }));
      }
    } catch (err) {
      setPushError(t("profile2.pushFailed", { error: err instanceof Error ? err.message : String(err) }));
    } finally {
      setPushBusy(false);
    }
  }, [pushEnabled, t]);

  return {
    form,
    set,
    toggleSpec,
    dirty,
    save,
    saving,
    message,
    education,
    addEducation,
    deleteEducation,
    avatarUrl,
    avatarUploading,
    uploadAvatar,
    sbpQrUrl,
    qrUploading,
    uploadQr,
    removeQr,
    pushSupported,
    pushEnabled,
    pushBusy,
    pushError,
    togglePush,
  };
}
