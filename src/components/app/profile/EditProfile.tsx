"use client";

import { useRef, useState } from "react";
import { isTerminalSite } from "@/lib/site-mode";
import { SITE_URL } from "@/lib/i18n/locale-url";
import { SPECIALIZATIONS, avatarInitial } from "@/lib/app-profile";
import ShareButtons from "@/components/shared/ShareButtons";
import WatchlistWidget from "@/components/profile/WatchlistWidget";
import AppIcon from "../AppIcon";
import AppSheet, { Sections, type SheetSection } from "../chat/AppSheet";
import { useProf } from "./ProfileCtx";
import { ScreenFrame } from "./parts";
import { useProfileForm } from "./useProfileForm";

// terminal.fomo.spot: only the name, the photo and the device's push switch belong to the profile there
const TERMINAL = isTerminalSite();

/** «Профиль» (the design's `profile` screen): photo + «Что видят читатели», with the rest of the old profile form below it. */
export default function EditProfile() {
  const { t, user, go, open } = useProf();
  const f = useProfileForm();
  const photoRef = useRef<HTMLInputElement>(null);
  const qrRef = useRef<HTMLInputElement>(null);
  const [eduSheet, setEduSheet] = useState(false);
  const [edu, setEdu] = useState({ university: "", faculty: "", specialty: "", yearEnd: "" });
  const [eduBusy, setEduBusy] = useState(false);

  const form = f.form;
  const pageId = form.fomoId || user?.fomoId || user?.id || "";
  const shareName = [form.firstName, form.lastName].filter(Boolean).join(" ") || form.displayName || t("profile.profile");

  const sections: SheetSection[] = [];

  sections.push({
    key: "readers",
    title: t("appprof.whatReadersSee"),
    footer: TERMINAL ? undefined : t("appprof.readersFoot"),
    rows: [
      { key: "fn", label: t("profile.firstName"), field: { value: form.firstName, ph: t("profile2.phFirstName"), onChange: (v) => f.set("firstName", v), maxLength: 100 } },
      { key: "ln", label: t("profile.lastName"), field: { value: form.lastName, ph: t("profile2.phLastName"), onChange: (v) => f.set("lastName", v), maxLength: 100 } },
      ...(TERMINAL
        ? []
        : [
            { key: "bio", label: t("profile.bio"), field: { value: form.bio, ph: t("profile2.phBio"), onChange: (v: string) => f.set("bio", v), maxLength: 500, multiline: true } },
            {
              key: "spec",
              label: t("profile.specialization"),
              chips: SPECIALIZATIONS.map((s) => ({ key: s.value, label: t(s.labelKey), on: form.specializations.includes(s.value), onClick: () => f.toggleSpec(s.value) })),
            },
            { key: "city", label: t("profile.city"), field: { value: form.city, ph: t("profile2.phCity"), onChange: (v: string) => f.set("city", v), maxLength: 100 } },
            { key: "exp", label: t("profile.exchangeExp"), field: { value: form.exchangeExperience, ph: t("profile2.phExperience"), onChange: (v: string) => f.set("exchangeExperience", v), maxLength: 100 } },
            { key: "work", label: t("profile.workplace"), field: { value: form.workplace, ph: t("profile2.phWorkplace"), onChange: (v: string) => f.set("workplace", v), maxLength: 200 } },
            { key: "birth", label: t("profile.birthDate"), field: { value: form.birthDate, ph: "", onChange: (v: string) => f.set("birthDate", v), type: "date" } },
          ]),
    ],
  });

  sections.push({
    key: "account",
    title: t("appprof.account"),
    footer: TERMINAL ? undefined : t("profile2.fomoIdHint"),
    rows: [
      { key: "email", label: t("profile.email"), icon: <AppIcon name="mail" size={18} stroke={1.8} />, value: user?.email || "—", chev: true, onClick: () => go("security") },
      ...(TERMINAL
        ? []
        : [
            { key: "fomoid", label: t("profile.fomoId"), icon: <span style={{ fontWeight: 700 }}>#</span>, field: { value: form.fomoId, ph: "my_unique_id", onChange: (v: string) => f.set("fomoId", v.replace(/[^a-zA-Z0-9_!?$%]/g, "").slice(0, 33)), maxLength: 33, mono: true, autoComplete: "off" } },
            {
              key: "page",
              label: t("profile.myPage"),
              sub: `fomo.spot/profile/${pageId}`,
              icon: <AppIcon name="link" size={18} stroke={1.8} />,
              actions: [{ label: t("appprof.openPage"), onClick: () => open(`/profile/${pageId}`) }],
              extra: (
                <div style={{ marginTop: 8 }}>
                  <ShareButtons url={`${SITE_URL}/profile/${pageId}`} text={t("profile2.shareText", { name: shareName })} />
                </div>
              ),
            },
          ]),
    ],
  });

  if (!TERMINAL) {
    sections.push({
      key: "social",
      title: t("profile.socials"),
      rows: [
        { key: "tg", label: "Telegram", field: { value: form.telegram, ph: t("profile2.phTelegram"), onChange: (v) => f.set("telegram", v), maxLength: 200 } },
        { key: "vk", label: "VK", field: { value: form.vk, ph: "https://vk.com/...", onChange: (v) => f.set("vk", v), maxLength: 200 } },
        { key: "yt", label: "YouTube", field: { value: form.youtube, ph: "https://youtube.com/...", onChange: (v) => f.set("youtube", v), maxLength: 200 } },
        { key: "wa", label: "WhatsApp", field: { value: form.whatsapp, ph: "+7 999 123-45-67", onChange: (v) => f.set("whatsapp", v), maxLength: 200 } },
        { key: "max", label: "MAX", field: { value: form.max, ph: t("profile2.phProfileLink"), onChange: (v) => f.set("max", v), maxLength: 200 } },
        { key: "web", label: t("profile.website"), field: { value: form.website, ph: "https://...", onChange: (v) => f.set("website", v), maxLength: 500 } },
      ],
    });

    sections.push({
      key: "edu",
      title: t("profile.education"),
      footer: f.education.length === 0 ? t("profile.noEducation") : undefined,
      rows: [
        ...f.education.map((e) => ({
          key: e.id,
          label: e.university,
          sub: [e.faculty, e.specialty, e.yearEnd ? t("profile2.graduation", { year: e.yearEnd }) : ""].filter(Boolean).join(" · ") || undefined,
          actions: [{ label: t("common.delete"), tone: "danger" as const, onClick: () => void f.deleteEducation(e.id) }],
        })),
        { key: "add", label: t("profile.addEducation"), icon: <AppIcon name="plus" size={18} stroke={1.8} />, color: "var(--app-green-tx)", onClick: () => setEduSheet(true) },
      ],
    });

    sections.push({
      key: "money",
      title: t("appprof.donations"),
      footer: t("profile2.donationHint"),
      rows: [
        { key: "card", label: t("profile.donationCard"), field: { value: form.donationCard, ph: "0000 0000 0000 0000", onChange: (v) => f.set("donationCard", v), maxLength: 30, mono: true, inputMode: "numeric", autoComplete: "off" } },
        {
          key: "qr",
          label: t("profile2.sbpQr"),
          sub: t("profile2.sbpQrHint"),
          extra: (
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
              {f.sbpQrUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="ap-qr" src={f.sbpQrUrl} alt={t("profile2.sbpQr")} />
              ) : (
                <div className="ap-qr-empty" onClick={() => qrRef.current?.click()} role="button" tabIndex={0}>
                  <AppIcon name="image" size={26} stroke={1.5} />
                </div>
              )}
              <div className="ac-acts" style={{ marginTop: 0 }}>
                <span role="button" tabIndex={0} className="ac-act" data-off={f.qrUploading ? "1" : undefined} onClick={() => qrRef.current?.click()}>
                  {f.qrUploading ? t("common.loading") : f.sbpQrUrl ? t("profile2.replaceQr") : t("profile2.uploadQr")}
                </span>
                {f.sbpQrUrl && (
                  <span role="button" tabIndex={0} className="ac-act" data-tone="danger" onClick={() => void f.removeQr()}>
                    {t("common.delete")}
                  </span>
                )}
              </div>
            </div>
          ),
        },
      ],
    });

    sections.push({
      key: "dm",
      title: t("appprof.messages"),
      rows: [{ key: "dm", label: t("profile.allowDMs"), sub: t("profile2.dmHint"), toggle: form.dmEnabled, onClick: () => f.set("dmEnabled", !form.dmEnabled) }],
    });
  }

  if (f.pushSupported)
    sections.push({
      key: "push",
      title: t("appprof.thisDevice"),
      footer: f.pushError || undefined,
      rows: [
        {
          key: "push",
          label: t("profile.pushNotifications"),
          sub: t("profile.pushNotificationsDesc"),
          icon: <AppIcon name="bell" size={18} stroke={1.8} />,
          toggle: f.pushEnabled,
          disabled: f.pushBusy,
          onClick: () => void f.togglePush(),
        },
      ],
    });

  const initial = avatarInitial(form.displayName || user?.name);

  return (
    <ScreenFrame
      title={t("profile.profile")}
      right={[{ key: "save", label: f.saving ? t("channels.saving") : t("common.save"), disabled: !f.dirty || f.saving, onClick: () => void f.save() }]}
    >
      <div className="ap-photo">
        <div className="ap-ava" role="button" tabIndex={0} onClick={() => photoRef.current?.click()}>
          {f.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={f.avatarUrl} alt="" />
          ) : (
            initial
          )}
        </div>
      </div>
      <Sections
        sections={[
          {
            key: "photo",
            footer: t("profile2.photoHint"),
            rows: [
              {
                key: "photo",
                label: f.avatarUploading ? t("common.loading") : f.avatarUrl ? t("profile2.changePhoto") : t("profile2.uploadPhoto"),
                color: "var(--app-green-tx)",
                icon: <AppIcon name="camera" size={18} stroke={1.8} />,
                onClick: () => photoRef.current?.click(),
              },
            ],
          },
        ]}
      />
      <input
        ref={photoRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void f.uploadAvatar(file);
          e.target.value = "";
        }}
      />
      <input
        ref={qrRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void f.uploadQr(file);
          e.target.value = "";
        }}
      />

      <Sections sections={sections} />

      {!TERMINAL && user?.id && (
        <div className="ap-skin" data-watch="1">
          <WatchlistWidget userId={user.id} isOwner />
        </div>
      )}

      <button type="button" className="ap-primary" disabled={!f.dirty || f.saving} onClick={() => void f.save()}>
        {f.saving ? t("channels.saving") : t("common.save")}
      </button>
      {f.message && (
        <div className="ap-msg" data-err={f.message.error ? "1" : undefined} role="status">
          {f.message.text}
        </div>
      )}

      {eduSheet && (
        <AppSheet
          title={t("profile.education")}
          onClose={() => setEduSheet(false)}
          left={{ label: t("common.cancel"), onClick: () => setEduSheet(false) }}
          right={null}
          doneLabel={t("appui.chat.done")}
          sections={[
            {
              key: "f",
              rows: [
                { key: "u", label: `${t("profile.university")} *`, field: { value: edu.university, ph: t("profile2.phUniversity"), onChange: (v) => setEdu((s) => ({ ...s, university: v })) } },
                { key: "fa", label: t("profile.faculty"), field: { value: edu.faculty, ph: "", onChange: (v) => setEdu((s) => ({ ...s, faculty: v })) } },
                { key: "sp", label: t("profile.specialty"), field: { value: edu.specialty, ph: "", onChange: (v) => setEdu((s) => ({ ...s, specialty: v })) } },
                { key: "y", label: t("profile.yearEnd"), field: { value: edu.yearEnd, ph: "2020", onChange: (v) => setEdu((s) => ({ ...s, yearEnd: v.replace(/\D/g, "").slice(0, 4) })), inputMode: "numeric" } },
              ],
            },
          ]}
          btn={{
            label: eduBusy ? t("channels.saving") : t("profile.addEducation"),
            disabled: eduBusy || !edu.university.trim(),
            onClick: () => {
              setEduBusy(true);
              void f.addEducation(edu).then((ok) => {
                setEduBusy(false);
                if (ok) {
                  setEdu({ university: "", faculty: "", specialty: "", yearEnd: "" });
                  setEduSheet(false);
                }
              });
            },
          }}
        />
      )}
    </ScreenFrame>
  );
}
