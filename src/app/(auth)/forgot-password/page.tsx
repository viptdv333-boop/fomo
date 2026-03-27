"use client";

import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    setMessage(""); setError(""); setLoading(true);
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "send-code", email }),
    });
    const data = await res.json();
    setLoading(false);
    if (res.ok) { setMessage(data.message); setStep("code"); }
    else setError(data.error);
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setMessage(""); setError("");
    if (newPassword !== confirmPassword) { setError("Пароли не совпадают"); return; }
    setLoading(true);
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reset", email, code, newPassword }),
    });
    const data = await res.json();
    setLoading(false);
    if (res.ok) { setMessage(data.message); setDone(true); }
    else setError(data.error);
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
        <div className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl shadow-lg p-8 text-center">
          <div className="text-4xl mb-4">✅</div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Пароль изменён!</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Теперь войдите с новым паролем</p>
          <Link href="/login" className="block w-full text-center rounded-lg bg-green-600 px-6 py-2.5 text-white font-medium hover:bg-green-700 transition">
            Войти
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
      <div className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl shadow-lg p-8">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Восстановление пароля</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {step === "email" ? "Введите email для получения кода" : "Введите код и новый пароль"}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-lg">
            {error}
          </div>
        )}
        {message && !error && (
          <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 text-sm rounded-lg">
            {message}
          </div>
        )}

        {step === "email" ? (
          <form onSubmit={handleSendCode} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-2.5 border dark:border-gray-700 rounded-lg text-sm dark:bg-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-green-500 focus:outline-none"
                placeholder="your@email.com"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition disabled:opacity-50"
            >
              {loading ? "Отправка..." : "Отправить код"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleReset} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Код из письма</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                maxLength={6}
                placeholder="123456"
                className="w-full px-4 py-2.5 border dark:border-gray-700 rounded-lg text-sm dark:bg-gray-800 dark:text-gray-100 text-center text-lg tracking-widest font-mono focus:ring-2 focus:ring-green-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Новый пароль</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full px-4 py-2.5 pr-10 border dark:border-gray-700 rounded-lg text-sm dark:bg-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-green-500 focus:outline-none"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  )}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Подтвердите пароль</label>
              <input
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="w-full px-4 py-2.5 border dark:border-gray-700 rounded-lg text-sm dark:bg-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-green-500 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition disabled:opacity-50"
            >
              {loading ? "Сброс..." : "Сбросить пароль"}
            </button>
            <button type="button" onClick={() => { setStep("email"); setError(""); }} className="w-full text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
              ← Назад
            </button>
          </form>
        )}

        <div className="text-center mt-6">
          <Link href="/login" className="text-sm text-green-600 hover:text-green-700 font-medium">
            Вернуться ко входу
          </Link>
        </div>
      </div>
    </div>
  );
}
