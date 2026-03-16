"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import IdeaForm from "@/components/ideas/IdeaForm";

export default function EditIdeaPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const [initialData, setInitialData] = useState<{
    title: string;
    preview: string;
    content: string;
    isPaid: boolean;
    price: number | null;
    instrumentIds: string[];
    attachments?: { url: string; name: string }[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/ideas/${params.id}`);
      if (!res.ok) {
        setError("Идея не найдена");
        setLoading(false);
        return;
      }
      const data = await res.json();

      const isAdmin = (session?.user as any)?.role === "ADMIN";
      const isAuthor = session?.user?.id === data.author.id;
      if (!isAdmin && !isAuthor) {
        router.push(`/ideas/${params.id}`);
        return;
      }

      setInitialData({
        title: data.title,
        preview: data.preview,
        content: data.content || "",
        isPaid: data.isPaid,
        price: data.price,
        instrumentIds: data.instruments.map((i: any) => i.id),
        attachments: data.attachments || [],
      });
      setLoading(false);
    }
    if (session) load();
  }, [params.id, session]);

  if (loading) return <div className="text-gray-500 py-12 text-center">Загрузка...</div>;
  if (error) return <div className="text-red-500 py-12 text-center">{error}</div>;
  if (!initialData) return null;

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Редактирование идеи</h1>
      <IdeaForm mode="edit" ideaId={params.id as string} initialData={initialData} />
    </div>
  );
}
