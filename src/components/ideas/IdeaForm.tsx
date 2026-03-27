"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Instrument {
  id: string;
  name: string;
  slug: string;
  ticker: string;
  exchangeRel?: { shortName: string };
}

interface SelectedChip {
  id: string;
  ticker: string;
  exchange: string;
  auto?: boolean;
}

interface Attachment {
  url: string;
  name: string;
}

interface IdeaFormProps {
  mode: "create" | "edit";
  ideaId?: string;
  preselectedInstrumentId?: string;
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

export default function IdeaForm({ mode, ideaId, initialData, preselectedInstrumentId }: IdeaFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [title, setTitle] = useState(initialData?.title || "");
  const [preview, setPreview] = useState(initialData?.preview || "");
  const [content, setContent] = useState(initialData?.content || "");
  const [isPaid, setIsPaid] = useState(initialData?.isPaid || false);
  const [price, setPrice] = useState(initialData?.price ? String(initialData.price) : "");
  const [acceptDonations, setAcceptDonations] = useState(initialData?.acceptDonations ?? false);
  const [selectedChips, setSelectedChips] = useState<SelectedChip[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>(
    initialData?.attachments || []
  );
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Instrument autocomplete state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Instrument[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load initial instruments in edit mode
  useEffect(() => {
    if (initialData?.instrumentIds && initialData.instrumentIds.length > 0) {
      fetch("/api/instruments?search=")
        .then((r) => r.json())
        .then((all: Instrument[]) => {
          const chips: SelectedChip[] = all
            .filter((inst) => initialData.instrumentIds.includes(inst.id))
            .map((inst) => ({
              id: inst.id,
              ticker: inst.ticker,
              exchange: inst.exchangeRel?.shortName || "",
              auto: false,
            }));
          setSelectedChips(chips);
        });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Preselect instrument from URL param
  useEffect(() => {
    if (preselectedInstrumentId && selectedChips.length === 0) {
      fetch(`/api/instruments`)
        .then(r => r.json())
        .then((all: Instrument[]) => {
          const inst = all.find((i: Instrument) => i.id === preselectedInstrumentId);
          if (inst) {
            setSelectedChips([{
              id: inst.id,
              ticker: inst.ticker,
              exchange: inst.exchangeRel?.shortName || "",
              auto: false,
            }]);
          }
        });
    }
  }, [preselectedInstrumentId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced search
  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await fetch(`/api/instruments?search=${encodeURIComponent(value.trim())}`);
        if (res.ok) {
          const data: Instrument[] = await res.json();
          setSearchResults(data);
          setShowDropdown(true);
        }
      } finally {
        setSearchLoading(false);
      }
    }, 300);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        searchInputRef.current &&
        !searchInputRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Select instrument from search results
  async function selectInstrument(inst: Instrument) {
    if (selectedChips.some((c) => c.id === inst.id)) {
      setSearchQuery("");
      setShowDropdown(false);
      return;
    }
    const chip: SelectedChip = {
      id: inst.id,
      ticker: inst.ticker,
      exchange: inst.exchangeRel?.shortName || "",
      auto: false,
    };
    setSelectedChips((prev) => [...prev, chip]);
    setSearchQuery("");
    setShowDropdown(false);
    searchInputRef.current?.focus();

    // Fetch related instruments
    try {
      const res = await fetch(`/api/instruments/${inst.slug}/related`);
      if (res.ok) {
        const related: Instrument[] = await res.json();
        setSelectedChips((prev) => {
          const newChips = related
            .filter((r) => !prev.some((c) => c.id === r.id))
            .map((r) => ({
              id: r.id,
              ticker: r.ticker,
              exchange: r.exchangeRel?.shortName || "",
              auto: true,
            }));
          return [...prev, ...newChips];
        });
      }
    } catch {
      // silently ignore related fetch errors
    }
  }

  function removeChip(id: string) {
    setSelectedChips((prev) => prev.filter((c) => c.id !== id));
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
      instrumentIds: selectedChips.map((c) => c.id),
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
            className="w-full px-4 py-2 border dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-green-500 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
            placeholder="Краткий заголовок идеи"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Инструменты
          </label>

          {/* Autocomplete search */}
          <div className="relative">
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              onFocus={() => {
                if (searchResults.length > 0) setShowDropdown(true);
              }}
              className="w-full px-4 py-2 border dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-green-500 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
              placeholder="Поиск инструмента по тикеру или названию..."
            />
            {searchLoading && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                ...
              </div>
            )}

            {showDropdown && searchResults.length > 0 && (
              <div
                ref={dropdownRef}
                className="absolute z-20 mt-1 w-full max-h-60 overflow-y-auto bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg shadow-lg"
              >
                {searchResults.map((inst) => {
                  const alreadySelected = selectedChips.some((c) => c.id === inst.id);
                  return (
                    <button
                      key={inst.id}
                      type="button"
                      onClick={() => selectInstrument(inst)}
                      disabled={alreadySelected}
                      className={`w-full text-left px-4 py-2.5 text-sm transition ${
                        alreadySelected
                          ? "text-gray-400 dark:text-gray-600 cursor-default"
                          : "text-gray-800 dark:text-gray-200 hover:bg-green-50 dark:hover:bg-green-900/20"
                      }`}
                    >
                      <span className="font-medium text-green-600 dark:text-green-400">
                        #{inst.ticker}
                      </span>
                      {inst.exchangeRel?.shortName && (
                        <span className="text-gray-500 dark:text-gray-400 ml-1">
                          ({inst.exchangeRel.shortName})
                        </span>
                      )}
                      <span className="text-gray-500 dark:text-gray-400"> — {inst.name}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {showDropdown && searchQuery.trim() && searchResults.length === 0 && !searchLoading && (
              <div className="absolute z-20 mt-1 w-full bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg shadow-lg px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                Ничего не найдено
              </div>
            )}
          </div>

          {/* Selected instrument chips */}
          {selectedChips.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {selectedChips.map((chip) => (
                <span
                  key={chip.id}
                  className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium ${
                    chip.auto
                      ? "border border-gray-400 dark:border-gray-600 text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800"
                      : "border border-green-500 text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20"
                  }`}
                >
                  #{chip.ticker}
                  {chip.exchange && (
                    <span className="opacity-70"> ({chip.exchange})</span>
                  )}
                  {chip.auto && (
                    <span className="text-xs opacity-60 ml-0.5">(авто)</span>
                  )}
                  <button
                    type="button"
                    onClick={() => removeChip(chip.id)}
                    className="ml-1 text-current opacity-50 hover:opacity-100 transition"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          {selectedChips.length === 0 && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
              Выберите хотя бы один инструмент
            </p>
          )}
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
            className="w-full px-4 py-2 border dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-green-500 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
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
            className="w-full px-4 py-2 border dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-green-500 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
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
            className="px-4 py-2 border border-dashed border-gray-300 dark:border-gray-700 rounded-lg text-sm text-gray-500 dark:text-gray-400 hover:border-green-400 hover:text-green-600 dark:hover:text-green-400 transition disabled:opacity-50"
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
              className="w-5 h-5 rounded border-gray-300 dark:border-gray-700 text-green-600 focus:ring-green-500"
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
                className="w-48 px-4 py-2 border dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-green-500 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
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
          className="w-full bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-700 transition disabled:opacity-50"
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
