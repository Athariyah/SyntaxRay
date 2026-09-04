import { Reveal } from "@/components/reveal";
import { SubmitForm } from "@/components/submit-form";

export const metadata = { title: "Новое ревью — СинтексПруф" };

export default function NewReviewPage() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-12">
      <Reveal>
        <h1 className="text-3xl font-semibold tracking-tight">Отправить код на ревью</h1>
        <p className="mt-2 max-w-2xl text-slate-400">
          Загрузите архив с проектом, укажите ссылку на репозиторий или вставьте фрагмент кода.
          Анализ выполняется в изолированной среде, результат открывается в интерактивном редакторе.
        </p>
      </Reveal>
      <div className="mt-8">
        <Reveal delay={0.08}>
          <SubmitForm />
        </Reveal>
      </div>
    </div>
  );
}
