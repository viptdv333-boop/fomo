"use client";

import IdeaForm from "@/components/ideas/IdeaForm";

export default function NewIdeaPage() {
  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Новая идея</h1>
      <IdeaForm mode="create" />
    </div>
  );
}
