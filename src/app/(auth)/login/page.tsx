"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      if (result.error.includes("PENDING")) {
        setError("Ваш аккаунт ожидает одобрения администратора");
      } else if (result.error.includes("BANNED")) {
        setError("Ваш аккаунт заблокирован");
      } else {
        setError("Неверный email или пароль");
      }
      return;
    }

    router.push("/feed");
    router.refresh();
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg p-4 sm:p-6 lg:p-8">
      <Link href="/" className="flex justify-center mb-6">
        <Image
          src="/images/logo-light.png"
          alt="FOMO"
          width={160}
          height={80}
          className="block dark:hidden"
          priority
        />
        <Image
          src="/images/logo-dark.png"
          alt="FOMO"
          width={160}
          height={80}
          className="hidden dark:block"
          priority
        />
      </Link>
      <h1 className="text-2xl font-bold text-center mb-6 dark:text-gray-100">Вход в FOMO</h1>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 p-3 rounded-lg mb-4 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
            placeholder="your@email.com"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Пароль
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-gray-100"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50"
        >
          {loading ? "Вход..." : "Войти"}
        </button>
      </form>

      <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-4">
        Нет аккаунта?{" "}
        <a href="/register" className="text-blue-600 dark:text-blue-400 hover:underline">
          Зарегистрироваться
        </a>
      </p>
    </div>
  );
}
