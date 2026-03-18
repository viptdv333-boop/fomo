"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Instrument {
  id: string;
  name: string;
}

interface Attachment {
  url: string;
  name: string;
}

interface IdeaFormProps {
  mode: "create" | "edit";
  ideaId?: string;
  initialData?: {
    title: string;
    preview: string;
    content: string;
    isPaid: boolean;
    price: number | null;
    acceptDonations?: boolean;
    instrumentIds: string[];
    attachments?: Attachment[];
  };
}

export default function IdeaForm({ mode, ideaId, initialData }: IdeaFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [title, setTitle] = useState(initialData?.title || "");
  const [preview, setPreview] = useState(initialData?.preview || "");
  const [content, setContent] = useState(initialData?.content || "");
  const [isPaid, setIsPaid] = useState(initialData?.isPaid || false);
  const [price, setPrice] = useState(initialData?.price ? String(initialData.price) : "");
  const [acceptDonations, setAcceptDonations] = useState(initialData?.acceptDonations ?? false);
  const [selectedInstruments, setSelectedInstruments] = useState<string[]>(
    initialData?.instrumentIds || []
  );
  const [attachments, setAttachments] = useState<Attachment[]>(
    initialData?.attachments || []
  );
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/instruments")
      .then((r) => r.json())
      .then(setInstruments);
  }, []);

  function toggleInstrument(id: string) {
    setSelectedInstruments((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    const newAttachments: Attachment[] = [];
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("type", "ideas");
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (res.ok) {
        const data = await res.json();
        newAttachments.push({ url: data.url, name: data.name });
      }
    }
    setAttachments((prev) => [...prev, ...newAttachments]);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const body = {
      title,
      preview,
      content,
      isPaid,
      price: isPaid ? Number(price) : undefined,
      acceptDonations: !isPaid ? acceptDonations : false,
      instrumentIds: selectedInstruments,
      attachments: attachments.length > 0 ? attachments : undefined,
    };

    const url = mode === "edit" ? `/api/ideas/${ideaId}` : "/api/ideas";
    const method = mode === "edit" ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error || "Ошибка сохранения");
      return;
    }

    router.push(`/ideas/${data.id}`);
  }

  function isVideo(url: string) {
    return url.endsWith(".mp4") || url.endsWith(".webm");
  }

  return (
    <>
      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 p-3 rounded-lg mb-4 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Заголовок
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="w-full px-4 py-2 border dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
            placeholder="Краткий заголовок идеи"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Инструменты
          </label>
          <div className="flex flex-wrap gap-2">
            {instruments.map((inst) => (
              <button
                key={inst.id}
                type="button"
                onClick={() => toggleInstrument(inst.id)}
                className={`px-3 py-1.5 rounded-full text-sm transition ${
                  selectedInstruments.includes(inst.id)
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                }`}
              >
                {inst.name}
              </button>
            ))}
            {instruments.length === 0 && (
              <span className="text-gray-400 dark:text-gray-500 text-sm">
                Нет доступных инструментов
              </span>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Превью (бесплатный текст)
          </label>
          <textarea
            value={preview}
            onChange={(e) => setPreview(e.target.value)}
            required
            rows={3}
            className="w-full px-4 py-2 border dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
            placeholder="Краткое описание идеи, видимое всем"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Полный контент
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            required
            rows={10}
            className="w-full px-4 py-2 border dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
            placeholder="Детальный анализ, прогноз, обоснование..."
          />
        </div>

        {/* Attachments */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Вложения (фото/видео)
          </label>

          {attachments.length > 0 && (
            <div className="grid grid-cols-3 gap-3 mb-3">
              {attachments.map((att, i) => (
                <div key={i} className="relative group rounded-lg overflow-hidden border dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                  {isVideo(att.url) ? (
                    <video src={att.url} className="w-full h-24 object-cover" muted />
                  ) : (
                    <img src={att.url} alt={att.name} className="w-full h-24 object-cover" />
                  )}
                  <button
                    type="button"
                    onClick={() => removeAttachment(i)}
                    className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                  >
                    ×
                  </button>
                  <div className="text-xs text-gray-500 dark:text-gray-400 p-1 truncate">{att.name}</div>
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="px-4 py-2 border border-dashed border-gray-300 dark:border-gray-700 rounded-lg text-sm text-gray-500 dark:text-gray-400 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 transition disabled:opacity-50"
          >
            {uploading ? "Загрузка..." : "+ Добавить файлы"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm"
            onChange={handleFileUpload}
            className="hidden"
          />
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">JPG, PNG, WebP, GIF, MP4, WebM — до 10 МБ</p>
        </div>

        <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={isPaid}
              onChange={(e) => setIsPaid(e.target.checked)}
              className="w-5 h-5 rounded border-gray-300 dark:border-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span className="font-medium dark:text-gray-100">Платная идея</span>
          </label>

          {isPaid && (
            <div className="mt-3">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Цена (₽)
              </label>
              <input
                type="number"
                min="1"
                step="1"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
                className="w-48 px-4 py-2 border dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
                placeholder="100"
              />
            </div>
          )}
        </div>

        {/* Donations toggle — only for free ideas */}
        {!isPaid && (
          <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={acceptDonations}
                onChange={(e) => setAcceptDonations(e.target.checked)}
                className="w-5 h-5 rounded border-gray-300 dark:border-gray-700 text-green-600 focus:ring-green-500"
              />
              <div>
                <span className="font-medium dark:text-gray-100">Принимать донаты</span>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Читатели смогут отправить вам благодарность за идею. Настройте карту для донатов в профиле.
                </p>
              </div>
            </label>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50"
        >
          {loading
            ? mode === "edit"
              ? "Сохранение..."
              : "Публикация..."
            : mode === "edit"
            ? "Сохранить изменения"
            : "Опубликовать"}
        </button>
      </form>
    </>
  );
}
