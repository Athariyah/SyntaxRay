"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Переход между страницами БЕЗ блокировки навигации.
 *
 * Раньше здесь был `AnimatePresence mode="wait"`: новая страница не
 * монтировалась, пока не отыграет exit-анимация старой (~320 мс).
 * На тяжёлых страницах (Monaco, дашборд) exit-кадр проседал, вкладки
 * переключались с лагом, а при быстрых кликах навигация «залипала»
 * и казалось, что вкладка не подгрузилась.
 *
 * Теперь: новая страница монтируется мгновенно, лёгкая CSS-анимация
 * появления (`page-in`) не блокирует интерактив и уважает
 * prefers-reduced-motion.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <main key={pathname} className="animate-page-in flex-1">
      {children}
    </main>
  );
}
