# -*- coding: utf-8 -*-
"""
Сборка презентации проекта «СинтаксПруф» по шаблону «Акселератор ДГУ» (2.0_2026).

Источники данных:
- Акселератор.pdf (дек проекта)
- https://pt.2035.university/accelerator/747 (Акселерационная программа ДГУ, TechNet)

Запуск:  python build_presentation.py
Результат: Презентация_СинтаксПруф_Акселератор_ДГУ.pptx
"""

import os
from pptx import Presentation
from pptx.util import Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "assets")
OUT = os.path.join(HERE, "Презентация_СинтаксПруф_Акселератор_ДГУ.pptx")

# --- геометрия (точки, 1 pt = 1/72"): слайд 960x540 pt ---
SW, SH = 960.0, 540.0
EMU_PT = 12700

WHITE = RGBColor(0xFF, 0xFF, 0xFF)
BLACK = RGBColor(0x11, 0x11, 0x11)
GRAY_TEXT = RGBColor(0x33, 0x33, 0x33)
GRAY_NUM = RGBColor(0xA9, 0xA2, 0xB8)
PURPLE_HEAD = RGBColor(0x7A, 0x5F, 0x9E)
PURPLE_ROW1 = RGBColor(0xDC, 0xD7, 0xE6)
PURPLE_ROW2 = RGBColor(0xEB, 0xE8, 0xF0)
ORANGE_HEAD = RGBColor(0xF7, 0x9C, 0x3D)
ORANGE_ROW = RGBColor(0xFD, 0xF2, 0xE2)
LIGHT_VIOLET = RGBColor(0xC9, 0xC2, 0xD8)
ACCENT = RGBColor(0x6A, 0x2F, 0xB5)

TITLE_FONT = "Trebuchet MS"
BODY_FONT = "Calibri"


def pt(v):
    return Emu(int(round(v * EMU_PT)))


def add_pic(slide, name, x, y, w=None, h=None):
    kw = {}
    if w is not None:
        kw["width"] = pt(w)
    if h is not None:
        kw["height"] = pt(h)
    return slide.shapes.add_picture(os.path.join(ASSETS, name), pt(x), pt(y), **kw)


def add_text(slide, x, y, w, h, paragraphs, anchor=MSO_ANCHOR.TOP):
    """paragraphs: list of dicts:
       {runs: [(text, bold, size, color)], size, color, bold, align, space_after, line_spacing}"""
    box = slide.shapes.add_textbox(pt(x), pt(y), pt(w), pt(h))
    tf = box.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = anchor
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    for i, p in enumerate(paragraphs):
        para = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        para.alignment = p.get("align", PP_ALIGN.LEFT)
        if "space_after" in p:
            para.space_after = Pt(p["space_after"])
        if "line_spacing" in p:
            para.line_spacing = p["line_spacing"]
        runs = p.get("runs") or [(p.get("text", ""), p.get("bold", False),
                                  p.get("size", 13), p.get("color", GRAY_TEXT))]
        for text, bold, size, color in runs:
            r = para.add_run()
            r.text = text
            r.font.bold = bold
            r.font.size = Pt(size)
            r.font.color.rgb = color
            r.font.name = p.get("font", BODY_FONT)
    return box


def content_header(slide, title, page_num, title_size=32):
    add_pic(slide, "bg_content.png", 0, 0, SW, SH)
    add_pic(slide, "squiggle.png", 732.96, 0, 227.0, 126.2)
    add_pic(slide, "badge_techner.png", 761.28, 0, 227.4, 39.8)
    # черная планка слева от заголовка
    bar = slide.shapes.add_shape(1, pt(44.5), pt(63), pt(8), pt(40))  # 1 = rectangle
    bar.fill.solid()
    bar.fill.fore_color.rgb = BLACK
    bar.line.fill.background()
    add_text(slide, 63.8, 57, 860, 52,
             [{"text": title, "bold": True, "size": title_size,
               "color": BLACK, "font": TITLE_FONT}])
    add_text(slide, 880, 505, 60, 24,
             [{"text": str(page_num), "bold": True, "size": 16,
               "color": GRAY_NUM, "font": TITLE_FONT, "align": PP_ALIGN.RIGHT}])


def style_cell(cell, text, size, bold=False, color=BLACK, fill=None,
               align=PP_ALIGN.LEFT, font=BODY_FONT):
    if fill is not None:
        cell.fill.solid()
        cell.fill.fore_color.rgb = fill
    cell.vertical_anchor = MSO_ANCHOR.MIDDLE
    cell.margin_left = Pt(6)
    cell.margin_right = Pt(5)
    cell.margin_top = Pt(2)
    cell.margin_bottom = Pt(2)
    tf = cell.text_frame
    tf.word_wrap = True
    para = tf.paragraphs[0]
    para.alignment = align
    r = para.add_run()
    r.text = text
    r.font.bold = bold
    r.font.size = Pt(size)
    r.font.color.rgb = color
    r.font.name = font


def add_table(slide, x, y, col_widths, row_heights, data, header_fill=PURPLE_HEAD,
              row_fills=(PURPLE_ROW1, PURPLE_ROW2), body_size=11,
              header_size=11, header_color=WHITE, col_aligns=None):
    rows, cols = len(data), len(data[0])
    total_w = sum(col_widths)
    total_h = sum(row_heights)
    gt = slide.shapes.add_table(rows, cols, pt(x), pt(y), pt(total_w), pt(total_h))
    table = gt.table
    table.first_row = False
    table.horz_banding = False
    for j, w in enumerate(col_widths):
        table.columns[j].width = pt(w)
    for i, h in enumerate(row_heights):
        table.rows[i].height = pt(h)
    for i, row in enumerate(data):
        for j, text in enumerate(row):
            if i == 0:
                style_cell(table.cell(i, j), text, header_size, bold=True,
                           color=header_color, fill=header_fill,
                           align=PP_ALIGN.CENTER)
            else:
                align = PP_ALIGN.LEFT
                if col_aligns and col_aligns[j] == "c":
                    align = PP_ALIGN.CENTER
                style_cell(table.cell(i, j), text, body_size,
                           fill=row_fills[(i - 1) % len(row_fills)], align=align)
    return table


def bullet(label, text, size=13, space_after=7, color=GRAY_TEXT):
    runs = []
    if label:
        runs.append((label + " ", True, size, BLACK))
    runs.append((text, False, size, color))
    return {"runs": runs, "space_after": space_after, "line_spacing": 1.0}


def build():
    prs = Presentation()
    prs.slide_width = pt(SW)
    prs.slide_height = pt(SH)
    blank = prs.slide_layouts[6]

    # ============================ 1. ТИТУЛ ============================
    s = prs.slides.add_slide(blank)
    add_pic(s, "bg_title.png", 0, 0, SW, SH)
    add_pic(s, "logos_strip.png", 35, 33, 925, 69)
    add_pic(s, "gold_line.png", 88.56, 112.56, 811.4, 427.4)
    add_text(s, 43.5, 215, 700, 62, [
        {"text": "СинтаксПруф", "bold": True, "size": 48,
         "color": WHITE, "font": TITLE_FONT},
    ])
    add_text(s, 47, 288, 640, 60, [
        {"text": "платформа автоматизированного статического анализа\nи ИИ-ревью программного кода",
         "size": 18, "color": WHITE, "line_spacing": 1.15},
    ])
    add_text(s, 47, 380, 720, 22, [
        {"text": "Акселерационная программа ДГУ по направлению TechNet · pt.2035.university/accelerator/747",
         "size": 11, "color": LIGHT_VIOLET},
    ])
    add_text(s, 47, 452, 700, 52, [
        {"text": "Исмаилов Ислам Шафикович", "bold": True, "size": 18,
         "color": WHITE, "font": BODY_FONT, "space_after": 4},
        {"text": "StevenScreamches@ya.ru  ·  +7 (928) 218-30-30",
         "size": 14, "color": WHITE},
    ])

    # ============================ 2. ПРОБЛЕМА ============================
    s = prs.slides.add_slide(blank)
    content_header(s, "ПРОБЛЕМА", 2)
    add_text(s, 44.9, 128, 885, 370, [
        bullet("Чья проблема:", "команды разработки программного обеспечения — от BigTech до малого бизнеса, а также образовательные площадки TechNet/EduNet НТИ, которым необходим контроль происхождения и качества кода.", 12, 8),
        bullet("Как проблема решается в настоящее время:", "вручную — Code Review силами senior-инженеров; классическими утилитами статического анализа (SAST).", 12, 8),
        bullet("Почему существующее решение хуже:", "инженеры уровня Senior и Lead тратят до 20–30% рабочего времени на проверку кода младших специалистов; существующие инструменты не отличают код человека от фрагментов, сгенерированных LLM, и не проверяют семантическую безопасность AI-советов — растут риски нарушения авторских прав и снижения понимания архитектуры самими разработчиками.", 12, 8),
        bullet("У каких потребителей проблема стоит наиболее остро:", "руководство BigTech-компаний (стоимость senior-времени), HR-специалисты малого бизнеса (проверка кандидатов), компании и вузы, внедряющие ИИ-инструменты в процесс разработки.", 12, 8),
        bullet("Сколько компаний сталкиваются с проблемой:", "все dev-команды, использующие генеративный ИИ при написании кода (сегмент быстро растёт); на EduNet — площадки, проверяющие авторство работ (2i school (Сбер), VK education, Avito Start).", 12, 8),
        bullet("Количественные оценки проблемы:", "потери до 20–30% рабочего времени senior-инженеров на Code Review; риск проникновения уязвимостей из LLM-советов (переполнение буфера, небезопасные API и др.) в продакшн-продукт.", 12, 8),
        bullet("Подтверждение актуальности:", "[CustDev: опросы dev-команд и HR-специалистов, письма заинтересованности — приложить].", 12, 8),
    ])

    # ============================ 3. РЕШЕНИЕ ============================
    s = prs.slides.add_slide(blank)
    content_header(s, "РЕШЕНИЕ", 3)
    add_text(s, 44.9, 128, 470, 370, [
        bullet("Суть решения:", "«СинтаксПруф» — автоматизированная среда верификации исходного кода: достоверная дифференциация алгоритмов, написанных разработчиком-человеком, и фрагментов, сгенерированных большими языковыми моделями (LLM), плюс семантический контроль качества внедряемых решений.", 12.5, 8),
        bullet("Как продукт решает проблему:", "интеллектуальный пре-фильтр для Code Review снимает с senior-инженеров до 20–30% трудозатрат; контроль происхождения кода снижает риски нарушения авторских прав; семантический контроль безопасности (AI DevSecOps) выявляет находки CRITICAL / MAJOR / INFO с объяснениями (переполнение буфера через gets(), магические константы, избыточная сложность O(N²)) и оценивает качество кода по 100-балльной шкале.", 12.5, 8),
        bullet("Текущие → целевые параметры:", "сейчас — работающее веб-демо (движок статического анализа в браузере, полное ИИ-ревью по запросу); цель — промышленная точность, интеграция в CI/CD, поддержка B2B-процессов.", 12.5, 8),
        bullet("Экономическая эффективность:", "высвобождение 20–30% времени code review, сокращение выпуска уязвимого AI-кода, ускорение проверки кандидатов.", 12.5, 8),
        bullet("Сценарии применения:", "dev-команды BigTech и малого бизнеса; HR-проверка кода кандидатов; образовательные площадки EduNet.", 12.5, 4),
    ])
    add_pic(s, "demo_screenshot.png", 533, 165, 397, 196)
    add_text(s, 533, 368, 397, 20, [
        {"text": "Живое демо: статический анализ и ИИ-ревью прямо в браузере",
         "size": 10.5, "color": RGBColor(0x66, 0x60, 0x77), "align": PP_ALIGN.CENTER},
    ])

    # ============================ 4. ТЕХНОЛОГИЧЕСКОЕ ЯДРО ============================
    s = prs.slides.add_slide(blank)
    content_header(s, "ТЕХНОЛОГИЧЕСКОЕ ЯДРО ПРОЕКТА", 4, title_size=30)
    add_text(s, 44.9, 128, 545, 330, [
        bullet("Технологическое ядро:", "движок автоматизированного статического анализа + методы машинного обучения для достоверной дифференциации «код человека / LLM-генерация» + семантический контроль безопасности на базе ИИ-ревью (LLM).", 13, 9),
        bullet("К какой критической технологии относится:", "технологии машинного обучения и искусственного интеллекта (критическая технология НТИ, направление TechNet); элементы «Кибербезопасности» — AI DevSecOps.", 13, 9),
        bullet("За счёт чего улучшается продукт:", "ручная проверка заменяется автоматической верификацией с объяснимыми находками (CRITICAL / MAJOR / INFO) и количественной оценкой качества кода (0–100).", 13, 9),
    ])
    # карточки стека
    cards = [
        ("Frontend", "React.js / Next.js, развёрнут на платформе Vercel"),
        ("Backend", "Python (FastAPI) с контейнеризацией Docker"),
        ("ИИ-ревью", "LLM: полное ревью и семантический контроль"),
    ]
    cy = 140
    for name, desc in cards:
        card = s.shapes.add_shape(5, pt(625), pt(cy), pt(305), pt(74))  # rounded rect
        card.fill.solid()
        card.fill.fore_color.rgb = RGBColor(0xF4, 0xF1, 0xF9)
        card.line.color.rgb = RGBColor(0xC5, 0xB8, 0xDE)
        card.line.width = Pt(1)
        tf = card.text_frame
        tf.word_wrap = True
        tf.margin_left = Pt(12)
        tf.margin_top = Pt(10)
        p1 = tf.paragraphs[0]
        r = p1.add_run()
        r.text = name
        r.font.bold = True
        r.font.size = Pt(15)
        r.font.color.rgb = ACCENT
        r.font.name = TITLE_FONT
        p2 = tf.add_paragraph()
        p2.space_before = Pt(4)
        r2 = p2.add_run()
        r2.text = desc
        r2.font.size = Pt(11.5)
        r2.font.color.rgb = GRAY_TEXT
        r2.font.name = BODY_FONT
        cy += 90

    # ============================ 5. КОНКУРЕНТЫ ============================
    s = prs.slides.add_slide(blank)
    content_header(s, "КОНКУРЕНТЫ И АНАЛОГИ", 5)
    add_text(s, 44.9, 122, 885, 56, [
        {"text": "Сравнение ключевых функциональных характеристик продукта (по открытым данным вендоров). Прямых локальных решений с дифференциацией «человек / LLM» на рынке нет — это ключевое отличие «СинтаксПруф».",
         "size": 12.5, "color": GRAY_TEXT, "line_spacing": 1.05},
    ])
    data = [
        ["Характеристики продукта", "«СинтаксПруф»\n(Россия)",
         "SonarQube\n(SonarSource, Франция/США)",
         "CodeRabbit\n(США)", "Qodo\n(Израиль/США)"],
        ["Статический анализ качества и безопасности", "да", "да", "частично", "частично"],
        ["ИИ-ревью кода (LLM)", "да, полное ревью", "нет", "да", "да"],
        ["Определение происхождения кода (человек / LLM)", "да", "нет", "нет", "нет"],
        ["Семантический контроль безопасности (AI DevSecOps)", "да", "по правилам", "частично", "частично"],
        ["Пре-фильтр для Code Review (разгрузка senior-инженеров)", "да", "нет", "частично", "частично"],
        ["Уровень локализации", "100% РФ", "импорт", "импорт", "импорт"],
    ]
    add_table(s, 44.9, 195,
              col_widths=[252, 145, 190, 145, 153],
              row_heights=[36] + [33] * 6,
              data=data, body_size=10.5, header_size=10.5,
              col_aligns=["l", "c", "c", "c", "c"])

    # ============================ 6. МОНЕТИЗАЦИЯ / РЫНОК ============================
    s = prs.slides.add_slide(blank)
    content_header(s, "МОДЕЛЬ МОНЕТИЗАЦИИ, РЫНОК И ПОТРЕБИТЕЛИ", 6, title_size=27)
    add_text(s, 44.9, 132, 885, 360, [
        bullet("Потребители, готовые платить:", "BigTech-компании и dev-команды (руководители инженерных групп — экономия senior-времени на Code Review); HR-специалисты малого бизнеса (проверка кода кандидатов); образовательные площадки EduNet (2i school (Сбер), VK education, Avito Start — контроль авторства и качества кода).", 13, 9),
        bullet("Модель монетизации:", "SaaS-подписка для B2B-команд (тарифы per-seat / enterprise), лицензии для образовательных площадок; бесплатное живое демо — точка входа в продукт.", 13, 9),
        bullet("Путь коммерциализации:", "1–2 месяц — проектирование и разработка MVP; 3 месяц — тестирование и валидация MVP; 4–5 месяцы — пилотирование и подготовка к B2B-сегменту → платные пилоты и командные подписки.", 13, 9),
        bullet("Размер целевого рынка:", "российский рынок инструментов разработки и AI DevSecOps; ниша верификации происхождения кода (человек / LLM) локальными решениями не закрыта, спрос определяется массовым внедрением ИИ-ассистентов в разработку.", 13, 9),
        bullet("Объём продаж (прогноз):", "[заполнить по итогам пилотов: N команд × M тыс. ₽/мес].", 13, 4),
    ])

    # ============================ 7. КОМАНДА ============================
    s = prs.slides.add_slide(blank)
    content_header(s, "КОМАНДА И ПРОГРЕСС", 7)
    data = [
        ["Участник", "Роль в проекте", "Функционал и компетенции"],
        ["Исмаилов Ислам Шафикович", "Руководитель проекта",
         "Концепция и развитие продукта, управление проектом. StevenScreamches@ya.ru, +7 (928) 218-30-30"],
        ["Команда разработки [ФИО]", "Frontend / Backend-разработка",
         "React.js / Next.js (Vercel), Python (FastAPI), Docker — в компетенциях на «входе» в программу"],
        ["Наставники акселератора ДГУ", "Экспертное сопровождение",
         "Ускоренное обучение, экспертное наставничество, консалтинговое сопровождение (TechNet)"],
    ]
    add_table(s, 44.9, 128,
              col_widths=[240, 195, 450],
              row_heights=[28, 46, 46, 46],
              data=data, body_size=11, header_size=11)
    add_text(s, 44.9, 315, 885, 180, [
        bullet("Состав на «входе»:", "инициатор проекта и команда разработки с компетенциями fullstack (React/Next.js, Python/FastAPI, Docker) и статического анализа кода.", 12.5, 7),
        bullet("Состав на «выходе»:", "команда разработки + наставники акселератора, проработанная бизнес-составляющая (модель монетизации, путь коммерциализации) и подготовленный B2B-процесс пилотирования.", 12.5, 7),
        bullet("Прогресс:", "определено технологическое ядро, развёрнуто живое демо (оценка качества кода, находки CRITICAL / MAJOR / INFO), подготовлен план MVP → валидация → пилот.", 12.5, 4),
    ])

    # ============================ 8. ПАРТНЕРЫ ============================
    s = prs.slides.add_slide(blank)
    content_header(s, "ПАРТНЕРЫ", 8)
    add_text(s, 44.9, 132, 885, 330, [
        bullet("Партнёр проекта:", "Акселерационная программа ДГУ по направлению TechNet (pt.2035.university/accelerator/747) — интенсивное развитие стартап-проектов посредством ускоренного обучения, экспертного наставничества и консалтингового сопровождения обучающихся в целях формирования высокотехнологичных инновационных продуктов.", 13, 9),
        bullet("Задача партнёра, легшая в основу проекта:", "разработка инструментов контроля происхождения и качества программного кода для задач направления TechNet [уточнить формулировку по материалам программы].", 13, 9),
        bullet("Заинтересованные стороны и их роль:", "BigTech-компании и dev-команды — площадки для пилотирования и обратная связь; образовательные площадки EduNet (2i school (Сбер), VK education, Avito Start) — сценарии применения в обучении и экспертиза.", 13, 9),
        bullet("Совместные ближайшие шаги:", "организация пилотных внедрений, сбор обратной связи и подтверждение характеристик продукта, получение писем заинтересованности — приложить.", 13, 4),
    ])

    # ============================ 9. TRL ============================
    s = prs.slides.add_slide(blank)
    content_header(s, "УРОВЕНЬ ГОТОВНОСТИ ТЕХНОЛОГИИ", 9)
    add_text(s, 44.9, 122, 885, 90, [
        bullet("Текущий уровень готовности технологии — TRL 4–6:", "создание прототипа, подтверждение характеристик в лабораторных условиях. Артефакты: работающее живое демо статического анализа в браузере (скриншоты), результаты анализа тестового кода (CRITICAL: переполнение буфера gets(); MAJOR: избыточная сложность O(N²); INFO: магические константы). Целевой уровень после пилотирования — TRL 7.", 12.5, 4),
    ])
    add_text(s, 44.9, 218, 885, 18, [
        {"text": "ОПИСАНИЕ УРОВНЕЙ ГОТОВНОСТИ И СООТВЕТСТВУЮЩИХ ИМ АРТЕФАКТОВ",
         "size": 11, "bold": True, "color": RGBColor(0x55, 0x50, 0x62), "font": BODY_FONT},
    ])
    data = [
        ["Уровень готовности", "Краткое описание", "Артефакт", "Статус проекта"],
        ["1–3", "Формирование концепции, лабораторные исследования, создание макета",
         "Научные статьи, отчёты о моделировании, письма заинтересованности", "пройден"],
        ["4–6", "Создание прототипа, подтверждение характеристик в лабораторных условиях",
         "Фото/видео работающего макета, протоколы успешных экспериментов", "текущий — живое демо"],
        ["7", "Пилотирование проекта (опытные испытания)",
         "Видеодемонстрация в промышленных условиях, отчёт независимого тестирования", "цель — пилот с B2B"],
        ["8–9", "Предсерийное и серийное производство, коммерческое использование",
         "Акт пилотного проекта, контракты на продажу, отзывы клиентов", "далее"],
    ]
    add_table(s, 44.9, 242,
              col_widths=[105, 300, 320, 160],
              row_heights=[28, 38, 38, 38, 38],
              data=data, header_fill=ORANGE_HEAD,
              row_fills=(RGBColor(0xFD, 0xF2, 0xE2), RGBColor(0xFE, 0xF8, 0xEF)),
              body_size=10.5, header_size=10.5,
              col_aligns=["c", "l", "l", "c"])

    # ============================ 10. ПРОГРЕСС ЗА АКСЕЛЕРАЦИЮ ============================
    s = prs.slides.add_slide(blank)
    content_header(s, "ПРОГРЕСС ЗА ВРЕМЯ АКСЕЛЕРАЦИИ", 10)
    add_text(s, 44.9, 122, 885, 40, [
        {"text": "Достигнутые результаты за время участия в акселерационной программе ДГУ (решение, партнёрства, бизнес-составляющая).",
         "size": 13, "color": GRAY_TEXT},
    ])
    data = [
        ["До участия в акселерационной программе", "После участия в акселерационной программе"],
        ["Уровень готовности технологии — концепция и макет (TRL 3)",
         "Уровень готовности технологии — прототип, работающее живое демо (TRL 4–6)"],
        ["Производственная готовность — идея и архитектура продукта",
         "Производственная готовность — развёрнутый каркас MVP (Next.js, FastAPI, Docker), демо-движок анализа"],
        ["Рыночная готовность — описание проблемы и гипотезы",
         "Рыночная готовность — определены сегменты TechNet/EduNet, модель монетизации (SaaS B2B), путь коммерциализации"],
        ["Партнерства — не сформированы",
         "Партнерства — акселератор ДГУ (обучение, наставничество, консалтинг), потенциальные площадки BigTech/EduNet для пилотов"],
    ]
    add_table(s, 44.9, 178,
              col_widths=[430, 455],
              row_heights=[32, 42, 52, 52, 52],
              data=data, body_size=11.5, header_size=11.5)
    add_text(s, 44.9, 425, 885, 60, [
        {"text": "Также за время акселерации проработана бизнес-составляющая: потребители, модель монетизации, конкурентный анализ и план пилотирования (1–5 месяцы).",
         "size": 12, "color": RGBColor(0x55, 0x50, 0x62)},
    ])

    # ============================ 11. ПЛАНЫ РАЗВИТИЯ ============================
    s = prs.slides.add_slide(blank)
    content_header(s, "ПЛАНЫ РАЗВИТИЯ", 11)
    add_text(s, 44.9, 132, 885, 340, [
        bullet("Исследования и разработка:", "повышение точности дифференциации «человек / LLM», полноценное ИИ-ревью, расширение правил AI DevSecOps, интеграция в CI/CD. План реализации: 1–2 месяцы — проектирование и разработка MVP; 3 месяц — тестирование и валидация MVP; 4–5 месяцы — пилотирование и подготовка к B2B-сегменту.", 13, 9),
        bullet("Защита интеллектуальной собственности:", "регистрация ПО, патентование метода верификации происхождения кода, оформление товарного знака «СинтаксПруф».", 13, 9),
        bullet("Маркетинг, внедрение и продвижение:", "пилоты с B2B-командами, кейсы на образовательных площадках EduNet (2i school, VK education, Avito Start), публичное живое демо как инструмент привлечения.", 13, 9),
        bullet("Привлечение инвестиций:", "финансирование доработки MVP и пилотирования по итогам валидации; подготовка материалов для инвесторов по результатам пилотов.", 13, 4),
    ])

    # ============================ 12. ЗАПРОС ============================
    s = prs.slides.add_slide(blank)
    content_header(s, "ЗАПРОС", 12)
    add_text(s, 44.9, 132, 885, 320, [
        bullet("Компетенции и экспертиза:", "менторы по машинному обучению и анализу кода, экспертиза в кибербезопасности (AI DevSecOps), продуктовая экспертиза и go-to-market — для доведения MVP до промышленной точности.", 13, 9),
        bullet("Финансирование:", "доработка MVP и проведение пилотных внедрений в B2B-сегменте (4–5 месяцы плана), подготовка промышленной эксплуатации.", 13, 9),
        bullet("Продвижение:", "доступ к площадкам для пилотов — BigTech-компании, dev-команды малого бизнеса, образовательные организации EduNet.", 13, 9),
        bullet("Нетворкинг и партнерства:", "контакты с dev-командами, HR-службами и образовательными платформами для валидации продукта и первых внедрений.", 13, 4),
    ])

    # ============================ 13. ЭКСПЕРТНОЕ ЗАКЛЮЧЕНИЕ ============================
    s = prs.slides.add_slide(blank)
    content_header(s, "ЭКСПЕРТНОЕ ЗАКЛЮЧЕНИЕ", 13)
    add_text(s, 44.9, 122, 885, 60, [
        {"text": "Приложите комментарии экспертов по проекту (не менее 5 заключений): теоретическая реализуемость, коммерческий потенциал, соответствие основным научным принципам. Укажите ФИО эксперта и ссылку на профиль в ИС «Эксперты НТИ».",
         "size": 12.5, "color": GRAY_TEXT, "line_spacing": 1.05},
    ])
    data = [["№", "ФИО эксперта", "Ссылка на профиль в ИС «Эксперты НТИ»",
             "Аспект заключения", "Статус"]]
    aspects = ["Теоретическая реализуемость",
               "Коммерческий потенциал",
               "Соответствие научным принципам",
               "Технологическая экспертиза",
               "Рыночная экспертиза"]
    for i, asp in enumerate(aspects, 1):
        data.append([str(i), "[заполнить]", "[заполнить]", asp, "ожидается"])
    add_table(s, 44.9, 192,
              col_widths=[45, 235, 285, 210, 110],
              row_heights=[30] + [30] * 5,
              data=data, body_size=11, header_size=10.5,
              col_aligns=["c", "l", "l", "l", "c"])
    add_text(s, 44.9, 388, 885, 60, [
        bullet("", "Статус: экспертные заключения прикладываются по мере согласования; обязательные поля каждого заключения — ФИО эксперта, профиль в ИС «Эксперты НТИ», содержательная часть (реализуемость, коммерческий потенциал, научные принципы).", 11.5, 0, RGBColor(0x55, 0x50, 0x62)),
    ])

    prs.save(OUT)
    print("saved:", OUT)


if __name__ == "__main__":
    build()
