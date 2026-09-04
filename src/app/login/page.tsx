import { Reveal } from "@/components/reveal";
import { FullAuthPanel } from "@/components/auth-buttons";

export const metadata = { title: "Вход — СинтексПруф" };

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-lg px-6 py-16">
      <Reveal>
        <div className="text-center">
          <h1 className="text-3xl font-semibold tracking-tight">Вход в СинтексПруф</h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-slate-400">
            Выберите удобный способ входа. Поддерживаются российские сервисы — Яндекс, VK ID, MAX и Госуслуги (ЕСИА).
            После входа ваши ревью будут привязаны к профилю.
          </p>
        </div>
      </Reveal>

      <Reveal delay={0.08}>
        <div className="glass-strong mt-8 rounded-2xl p-6">
          <FullAuthPanel />
        </div>
      </Reveal>

      <Reveal delay={0.12}>
        <div className="mt-6 rounded-2xl border border-white/5 bg-white/[0.02] p-5 text-xs leading-relaxed text-slate-500">
          <p className="font-medium text-slate-300">Почему российские провайдеры?</p>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            <li>
              <span className="text-slate-300">Яндекс ID</span> — единая учётка для Яндекс сервисов, доступна всем студентам.
            </li>
            <li>
              <span className="text-slate-300">VK ID</span> — быстрая авторизация для аудитории VK, без паролей.
            </li>
            <li>
              <span className="text-slate-300">MAX</span> — новый мессенджер VK, OAuth-совместимый, удобно для хакатонов.
            </li>
            <li>
              <span className="text-slate-300">Госуслуги (ЕСИА)</span> — верифицированный профиль для вузов и госкурсов.
            </li>
          </ul>
          <p className="mt-3 text-slate-400">
            Для локального демо ключи не обязательны — вход работает в мок-режиме (demo_пользователь). В проде задайте{" "}
            <code className="font-mono text-slate-300">YANDEX_CLIENT_ID</code> и т.д. в Vercel Environment Variables.
          </p>
        </div>
      </Reveal>
    </div>
  );
}
