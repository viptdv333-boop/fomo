"use client";

import { useState, useEffect, useRef } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import Image from "next/image";

export default function RegisterPage() {
  const [step, setStep] = useState(1); // 1=email, 2=code, 3=details
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);

  // Countdown timer for resend
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  // Focus code input when step 2
  useEffect(() => {
    if (step === 2) codeRef.current?.focus();
  }, [step]);

  async function sendCode() {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Ошибка отправки кода");
        setLoading(false);
        return;
      }
      setStep(2);
      setCountdown(60);
    } catch {
      setError("Ошибка сети");
    }
    setLoading(false);
  }

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    await sendCode();
  }

  function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== 6) {
      setError("Введите 6-значный код");
      return;
    }
    setError("");
    setStep(3);
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, displayName, code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Ошибка регистрации");
        setLoading(false);
        return;
      }
      // Auto-login
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (result?.ok) {
        window.location.href = "/profile";
      } else {
        window.location.href = "/login";
      }
    } catch {
      setError("Ошибка сети");
    }
    setLoading(false);
  }

  async function resendCode() {
    if (countdown > 0) return;
    await sendCode();
  }

  const inputClass =
    "w-full px-4 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500 transition";

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg p-4 sm:p-6 lg:p-8">
      {/* Logo */}
      <Link href="/" className="flex justify-center mb-6">
        <Image
          src="/logo-fomo.png"
          alt="FOMO"
          width={160}
          height={80}
          priority
        />
      </Link>

      {/* Progress */}
      <div className="flex items-center justify-center gap-2 mb-6">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                s < step
                  ? "bg-green-500 text-white"
                  : s === step
                  ? "bg-green-600 text-white scale-110"
                  : "bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
              }`}
            >
              {s < step ? "✓" : s}
            </div>
            {s < 3 && (
              <div
                className={`w-8 h-0.5 ${
                  s < step ? "bg-green-500" : "bg-gray-200 dark:bg-gray-700"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 p-3 rounded-lg mb-4 text-sm">
          {error}
        </div>
      )}

      {/* Step 1: Email */}
      {step === 1 && (
        <form onSubmit={handleSendCode} className="space-y-4">
          <h1 className="text-xl font-bold text-center dark:text-gray-100">
            Введите email
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
            Мы отправим код подтверждения на вашу почту
          </p>
          <div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className={inputClass}
              placeholder="your@email.com"
              autoFocus
            />
          </div>
          <button
            type="submit"
            disabled={loading || !email}
            className="w-full bg-green-600 text-white py-2.5 rounded-lg font-medium hover:bg-green-700 transition disabled:opacity-50"
          >
            {loading ? "Отправка..." : "Получить код"}
          </button>
        </form>
      )}

      {/* Step 2: Code verification */}
      {step === 2 && (
        <form onSubmit={handleVerifyCode} className="space-y-4">
          <h1 className="text-xl font-bold text-center dark:text-gray-100">
            Проверьте почту
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
            Код отправлен на <span className="font-medium text-gray-700 dark:text-gray-300">{email}</span>
          </p>
          <div>
            <input
              ref={codeRef}
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className={`${inputClass} text-center text-2xl tracking-[0.5em] font-mono`}
              placeholder="000000"
            />
          </div>
          <button
            type="submit"
            disabled={code.length !== 6}
            className="w-full bg-green-600 text-white py-2.5 rounded-lg font-medium hover:bg-green-700 transition disabled:opacity-50"
          >
            Подтвердить
          </button>
          <div className="flex items-center justify-between text-sm">
            <button
              type="button"
              onClick={() => { setStep(1); setCode(""); setError(""); }}
              className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            >
              ← Изменить email
            </button>
            <button
              type="button"
              onClick={resendCode}
              disabled={countdown > 0 || loading}
              className={`${
                countdown > 0
                  ? "text-gray-400 dark:text-gray-500"
                  : "text-green-600 dark:text-green-400 hover:underline"
              }`}
            >
              {countdown > 0 ? `Повторно через ${countdown}с` : "Отправить снова"}
            </button>
          </div>
        </form>
      )}

      {/* Step 3: Name + Password */}
      {step === 3 && (
        <form onSubmit={handleRegister} className="space-y-4">
          <h1 className="text-xl font-bold text-center dark:text-gray-100">
            Создайте профиль
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
            Последний шаг — имя и пароль
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Имя
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              minLength={2}
              maxLength={50}
              className={inputClass}
              placeholder="Ваше имя"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Пароль
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className={`${inputClass} pr-10`}
                placeholder="Минимум 6 символов"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                )}
              </button>
            </div>
          </div>
          <button
            type="submit"
            disabled={loading || !displayName || !password}
            className="w-full bg-green-600 text-white py-2.5 rounded-lg font-medium hover:bg-green-700 transition disabled:opacity-50"
          >
            {loading ? "Регистрация..." : "Зарегистрироваться"}
          </button>
        </form>
      )}

      <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-5">
        Уже есть аккаунт?{" "}
        <Link href="/login" className="text-green-600 dark:text-green-400 hover:underline">
          Войти
        </Link>
      </p>
    </div>
  );
}
