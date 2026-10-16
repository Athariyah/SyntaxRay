# -*- coding: utf-8 -*-
"""
Сборка v2 презентации «СинтексПруф» (TechNet-фокус).

Изменения по правкам заказчика:
- фокус строго на TechNet (ИТ-команды, DevOps, AppSec, руководители разработки);
- «проверка production-кода, pull request, CI/CD» вместо учебных формулировок;
- EduNet только как вторичный сценарий (слайды 6 и 8 + сноски);
- монетизация B2B/B2Pro: per developer / repo / CI-pipeline, on-prem;
- метрики TechNet: время ручного ревью, FP/FN, time-to-merge, defect leakage, adoption в PR.

Фоны (заголовки, иллюстрации, рамки) — из текущего дека; текст и таблицы — поверх.
Запуск: python build_presentation_v2.py
"""

import os
from pptx import Presentation
from pptx.util import Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.oxml.ns import qn
from pptx.oxml import parse_xml

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "assets_v2")
OUT = os.path.join(HERE, "СинтексПруф_TechNet_v2.pptx")

SW, SH = 960.0, 540.0
EMU_PT = 12700

WHITE = RGBColor(0xFF, 0xFF, 0xFF)
DARK = RGBColor(0x1F, 0x29, 0x37)
GRAY = RGBColor(0x4B, 0x55, 0x63)
GRAY_L = RGBColor(0x6B, 0x72, 0x80)
ACCENT = RGBColor(0x93, 0x33, 0xEA)
ACCENT_D = RGBColor(0x6D, 0x28, 0xD9)
PURPLE_HEAD = RGBColor(0x5B, 0x2E, 0x8E)
ORANGE_HEAD = RGBColor(0xF7, 0x94, 0x33)
ROW_A = RGBColor(0xFF, 0xFF, 0xFF)
ROW_B = RGBColor(0xF6, 0xF2, 0xFA)
BORDER = RGBColor(0xC9, 0xC2, 0xD8)
STRIP_FILL = RGBColor(0xF3, 0xED, 0xFB)
LIGHT_VIOLET = RGBColor(0xD9, 0xCF, 0xF0)
DARK_CARD = RGBColor(0x2E, 0x21, 0x40)
DARK_CARD_BORDER = RGBColor(0x9B, 0x8A, 0xB8)

FONT = "Arial"


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
                                  p.get("size", 13), p.get("color", DARK))]
        for text, bold, size, color in runs:
            r = para.add_run()
            r.text = text
            r.font.bold = bold
            r.font.size = Pt(size)
            r.font.color.rgb = color
            r.font.name = FONT
    return box


def rounded_card(slide, x, y, w, h, fill=WHITE, line=None, line_w=1.0, radius=0.08):
    shp = slide.shapes.add_shape(5, pt(x), pt(y), pt(w), pt(h))  # rounded rect
    try:
        shp.adjustments[0] = radius
    except Exception:
        pass
    shp.fill.solid()
    shp.fill.fore_color.rgb = fill
    if line is None:
        shp.line.fill.background()
    else:
        shp.line.color.rgb = line
        shp.line.width = Pt(line_w)
    shp.shadow.inherit = False
    return shp


def accent_bar(slide, x, y, w=9, h=60, color=ACCENT):
    shp = slide.shapes.add_shape(1, pt(x), pt(y), pt(w), pt(h))
    shp.fill.solid()
    shp.fill.fore_color.rgb = color
    shp.line.fill.background()
    shp.shadow.inherit = False
    try:
        shp.adjustments  # noqa
    except Exception:
        pass
    return shp


def set_cell_border(cell, color=BORDER, width_pt=0.75):
    tc = cell._tc
    tcPr = tc.get_or_add_tcPr()
    for tag in ("a:lnL", "a:lnR", "a:lnT", "a:lnB"):
        for old in tcPr.findall(qn(tag)):
            tcPr.remove(old)
    for tag in ("a:lnL", "a:lnR", "a:lnT", "a:lnB"):
        ln = parse_xml(
            f'<{tag} xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
            f'w="{int(width_pt * 12700)}" cap="flat" cmpd="sng" algn="ctr">'
            f'<a:solidFill><a:srgbClr val="{"%02X%02X%02X" % (color[0], color[1], color[2])}"/></a:solidFill>'
            f'</{tag}>')
        tcPr.append(ln)


def style_cell(cell, text, size, bold=False, color=DARK, fill=None,
               align=PP_ALIGN.LEFT, border=BORDER, anchor=MSO_ANCHOR.MIDDLE):
    if fill is not None:
        cell.fill.solid()
        cell.fill.fore_color.rgb = fill
    cell.vertical_anchor = anchor
    cell.margin_left = Pt(7)
    cell.margin_right = Pt(6)
    cell.margin_top = Pt(3)
    cell.margin_bottom = Pt(3)
    set_cell_border(cell, border)
    tf = cell.text_frame
    tf.word_wrap = True
    lines = text.split("\n")
    for i, ln in enumerate(lines):
        para = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        para.alignment = align
        r = para.add_run()
        r.text = ln
        r.font.bold = bold
        r.font.size = Pt(size)
        r.font.color.rgb = color
        r.font.name = FONT


def add_table(slide, x, y, col_widths, row_heights, data, header_fill=PURPLE_HEAD,
              header_size=11.5, body_size=11, col_aligns=None, row_fills=(ROW_A, ROW_B),
              highlight_row=None, highlight_color=ACCENT):
    rows, cols = len(data), len(data[0])
    total_w, total_h = sum(col_widths), sum(row_heights)
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
            cell = table.cell(i, j)
            if i == 0:
                style_cell(cell, text, header_size, bold=True, color=WHITE,
                           fill=header_fill, align=PP_ALIGN.LEFT, border=header_fill)
            else:
                align = PP_ALIGN.LEFT
                if col_aligns and col_aligns[j] == "c":
                    align = PP_ALIGN.CENTER
                fill = row_fills[(i - 1) % len(row_fills)]
                border = BORDER
                if highlight_row is not None and i == highlight_row:
                    border = highlight_color
                bold = (j == 0)
                style_cell(cell, text, body_size, bold=bold, color=DARK,
                           fill=fill, align=align, border=border)
    return table


def build():
    prs = Presentation()
    prs.slide_width = pt(SW)
    prs.slide_height = pt(SH)
    blank = prs.slide_layouts[6]

    def new_slide(bg):
        s = prs.slides.add_slide(blank)
        add_pic(s, bg, 0, 0, SW, SH)
        return s

    # ===================== 1. ТИТУЛ =====================
    s = new_slide("bg_01.png")
    add_text(s, 48, 170, 500, 22, [
        {"text": "ПРОЕКТ АКСЕЛЕРАТОРА ДГУ / TECHNET", "bold": True, "size": 13.5,
         "color": LIGHT_VIOLET}])
    add_text(s, 48, 225, 700, 58, [
        {"text": "СинтексПруф", "bold": True, "size": 44, "color": WHITE}])
    add_text(s, 50, 292, 860, 62, [
        {"text": "Платформа статического анализа и ИИ-ревью production-кода\nдля IT-команд (C/C++/Python)",
         "bold": True, "size": 19, "color": WHITE, "line_spacing": 1.15}])
    add_text(s, 50, 372, 800, 24, [
        {"text": "Встраивается в CI/CD и PR: снижает время ручного Code Review и повышает качество кода",
         "size": 13, "color": LIGHT_VIOLET}])
    add_text(s, 49, 448, 600, 56, [
        {"text": "Исмаилов Ислам Шафикович", "bold": True, "size": 16,
         "color": WHITE, "space_after": 6},
        {"text": "aldarfgfg@gmail.com • +7 (928) 218-30-30", "size": 13, "color": WHITE}])

    # ===================== 2. ПРОБЛЕМА =====================
    s = new_slide("bg_02.png")
    add_text(s, 48, 181, 820, 30, [
        {"text": "Проверка кода не масштабируется вместе с потоком работ",
         "bold": True, "size": 21, "color": DARK}])
    cards2 = [
        ("Команды разработки",
         "До 20–30% времени Senior/Lead уходит на Code Review — узкое место в CI/CD и обратной связи."),
        ("ИИ-генерация кода",
         "LLM-код содержит ошибки, слабые места и лишнюю сложность; нужен автоматический контроль."),
        ("Рост потока изменений",
         "Микросервисы, CI/CD и частая поставка: ручное ревью не масштабируется, time-to-merge растёт."),
    ]
    for i, (t, d) in enumerate(cards2):
        x = 43.3 + i * 295.0
        rounded_card(s, x, 229, 283, 183)
        accent_bar(s, x + 12.4, 244, 9, 152)
        add_text(s, x + 31, 243, 235, 26, [
            {"text": t, "bold": True, "size": 16, "color": DARK}])
        add_text(s, x + 31, 272, 235, 120, [
            {"text": d, "size": 13, "color": GRAY, "line_spacing": 1.12}])
    add_text(s, 49, 434, 800, 22, [
        {"text": "«EduNet: проверка учебных работ — дополнительный сценарий, не ядро проекта».",
         "bold": True, "size": 13.5, "color": ACCENT_D}])
    add_text(s, 48, 508, 820, 16, [
        {"text": "Источник: «Акселератор.pdf», с. 2. Оценка 20–30% — тезис исходного питча, не проверенный замер.",
         "size": 8, "color": GRAY_L}])

    # ===================== 3. РЕШЕНИЕ =====================
    s = new_slide("bg_03.png")
    add_text(s, 49, 137, 560, 30, [
        {"text": "От дефекта — к понятному объяснению", "bold": True, "size": 23, "color": DARK}])
    add_text(s, 49, 168, 560, 52, [
        {"text": "Детерминированная проверка + ИИ-разбор:\nриски, асимптотика и замечания с привязкой к строкам кода.",
         "size": 15, "color": GRAY, "line_spacing": 1.18}])
    add_pic(s, "demo.png", 52.9, 219.6, 558.1, 276.1)
    rounded_card(s, 646, 158, 255, 139)
    add_text(s, 655, 161, 238, 24, [
        {"text": "Заявленная цель", "bold": True, "size": 14.5, "color": DARK}])
    add_text(s, 655, 186, 238, 64, [
        {"text": "Сократить время ручного ревью и повысить качество production-кода в CI/CD. Точность и экономия не подтверждены — измеряем в пилоте",
         "bold": True, "size": 10.5, "color": ACCENT_D, "line_spacing": 1.12}])
    add_text(s, 655, 254, 238, 40, [
        {"text": "Доп. функция для EduNet/HR:\nопределение LLM-кода", "bold": True,
         "size": 10.5, "color": DARK, "line_spacing": 1.12}])
    add_text(s, 52, 501, 860, 30, [
        {"runs": [("Метрики пилота: ", True, 10.5, DARK),
                  ("время ручного ревью, false positive / negative, time-to-merge, defect leakage, adoption в PR",
                   False, 10.5, GRAY)]}])

    # ===================== 4. ТЕХНОЛОГИЧЕСКОЕ ЯДРО =====================
    s = new_slide("bg_04.png")
    add_text(s, 50, 112, 700, 28, [
        {"text": "Правила сначала. ИИ — для объяснения.", "bold": True, "size": 20.5, "color": DARK}])
    steps = [
        ("01", "Ввод", "Исходный код C, C++ или Python"),
        ("02", "Анализ", "Статические проверки и выявление дефектов"),
        ("03", "ИИ-ревью", "Интерпретация риска и качества решения"),
        ("04", "Отчёт", "Приоритет и замечания по строкам"),
        ("05", "Интеграция", "GitHub/GitLab, CI/CD, SARIF, REST API, pre-commit,\nкомментарии в PR/MR"),
    ]
    ys = [147.2, 215.3, 283.2, 351.2, 417.8]
    for (num, t, d), y in zip(steps, ys):
        rounded_card(s, 45, y, 496, 67, radius=0.12)
        chip = rounded_card(s, 58, y + 12, 43, 43, fill=ACCENT_D, radius=0.22)
        add_text(s, 58, y + 22, 43, 24, [
            {"text": num, "bold": True, "size": 12, "color": WHITE, "align": PP_ALIGN.CENTER}])
        add_text(s, 110, y + 10, 420, 22, [
            {"text": t, "bold": True, "size": 15, "color": DARK}])
        add_text(s, 110, y + 33, 420, 34, [
            {"text": d, "size": 12, "color": GRAY, "line_spacing": 1.1}])
    add_text(s, 48, 488, 660, 50, [
        {"text": "Стек: React / Next.js • Python / FastAPI • Docker • PostgreSQL • Redis • очереди",
         "size": 10.5, "color": DARK, "space_after": 3},
        {"text": "Режимы: SaaS / on-prem • Соответствует TechNet: ИИ/ML, обработка данных, DevTools",
         "size": 10.5, "color": DARK, "space_after": 3},
        {"text": "EduNet: частный сценарий на той же платформе • Сквозная технология — искусственный интеллект (НТИ)",
         "size": 9.5, "color": GRAY_L}])

    # ===================== 5. КОНКУРЕНТЫ =====================
    s = new_slide("bg_05.png")
    add_text(s, 44, 131, 860, 28, [
        {"text": "Позиционирование: ревью кода для TechNet. EduNet — дополнительный сценарий",
         "bold": True, "size": 16.5, "color": DARK}])
    add_text(s, 44, 161, 860, 20, [
        {"text": "Сравнение сценариев по открытым описаниям, без измерения точности и цены.",
         "size": 12.5, "color": GRAY}])
    data5 = [
        ["Критерий", "СинтексПруф\nпроект ДГУ", "SonarQube\nSonarSource, Швейцария",
         "CodeRabbit\nСША", "Copilot Review\nGitHub, США"],
        ["Назначение", "Проверка production-кода и ИИ-ревью pull requests для IT-команд",
         "Качество и безопасность ПО", "ИИ-ревью pull requests", "ИИ-ревью pull requests"],
        ["Основной подход", "Правила + ИИ", "Правила; AI CodeFix для ряда задач",
         "ИИ + статические инструменты", "ИИ-обратная связь"],
        ["Рабочий процесс", "PR/MR, CI, IDE, отчёт по строкам; загрузка кода — fallback",
         "Анализ проекта, список issues", "Коммиты и pull requests", "PR и IDE"],
        ["Интеграции", "GitHub/GitLab, CI/CD, IDE; SaaS / on-prem",
         "CI/CD, плагины, API; self-hosted / облако", "GitHub; SaaS", "GitHub, VS Code; SaaS"],
    ]
    add_table(s, 38, 200, [180, 190, 175, 155, 178],
              [46, 52, 44, 52, 58], data5,
              header_fill=PURPLE_HEAD, header_size=11, body_size=10.5)
    add_text(s, 44, 466, 880, 40, [
        {"text": "Вывод: прямого локального аналога «правила + ИИ + on-prem» нет; преимущество нужно подтвердить сопоставимыми испытаниями по качеству, времени и стоимости.",
         "size": 11, "color": ACCENT_D, "space_after": 4},
        {"text": "EduNet — дополнительный сценарий (проверка учебных работ) на той же платформе; не ядро позиционирования.",
         "size": 10.5, "color": GRAY}])
    add_text(s, 197, 512, 400, 16, [
        {"runs": [("SonarQube Docs", False, 8.2, ACCENT_D), ("  •  ", False, 8.2, GRAY_L),
                  ("CodeRabbit Docs", False, 8.2, ACCENT_D), ("  •  ", False, 8.2, GRAY_L),
                  ("GitHub Docs", False, 8.2, ACCENT_D), ("   (окт. 2026)", False, 8.2, GRAY_L)]}])

    # ===================== 6. МОНЕТИЗАЦИЯ / РЫНОК =====================
    s = new_slide("bg_06.png")
    add_text(s, 48, 131, 620, 28, [
        {"text": "Кто использует и кто может платить", "bold": True, "size": 20.5, "color": DARK}])
    cards6 = [
        ("ИТ-команды / TechNet — первичный сегмент",
         "Первичный фильтр до ручного Code Review, встраивание в CI/CD и PR. Для разработчиков, DevOps, AppSec и руководителей разработки."),
        ("DevOps / AppSec / платформенные команды — первичный сегмент",
         "Политики качества и безопасности, автоматизация проверок, quality gates в CI/CD."),
        ("HR / обучающие программы — вторичный сегмент",
         "Разбор тестовых заданий и оценка решений кандидатов — не ядро продукта."),
    ]
    for i, (t, d) in enumerate(cards6):
        y = 175 + i * 93
        rounded_card(s, 44, y, 571, 90)
        accent_bar(s, 56, y + 15, 10, 60)
        add_text(s, 75, y + 9, 530, 32, [
            {"text": t, "bold": True, "size": 14, "color": DARK, "line_spacing": 1.05}])
        add_text(s, 75, y + 41, 530, 44, [
            {"text": d, "size": 12, "color": GRAY, "line_spacing": 1.1}])
    rounded_card(s, 44, 455, 571, 51, fill=STRIP_FILL)
    add_text(s, 61, 467, 540, 30, [
        {"text": "Монетизация: B2B/B2Pro-подписка — per developer / repo / CI-pipeline; on-prem лицензия; платные пилоты. B2Edu — дополнительный канал.",
         "bold": True, "size": 11.5, "color": ACCENT_D, "line_spacing": 1.1}])
    add_text(s, 48, 513, 720, 16, [
        {"text": "EduNet — частично: дополнительный пилот/канал после TechNet-пилота. Цену и размер рынка уточняют CustDev и пилоты.",
         "size": 8.5, "color": GRAY_L}])

    # ===================== 7. КОМАНДА =====================
    s = new_slide("bg_07.png")
    add_text(s, 49, 133, 500, 26, [
        {"text": "Команда проекта: 5 участников", "bold": True, "size": 18, "color": DARK}])
    add_text(s, 49, 163, 500, 18, [
        {"text": "Лидер: aldarfgfg@gmail.com • +7 (928) 218-30-30", "size": 11, "color": ACCENT_D}])
    add_text(s, 527, 176, 90, 14, [
        {"text": "UnTI ID / Leader ID", "size": 8.8, "color": GRAY_L}])
    team = [
        ("Исмаилов Ислам Шафикович", "Руководитель проекта · Тимлид", "U2579564 / 7124087"),
        ("Яхьяев Абдуллах Закарьяевич", "Технический специалист · Backend / DevOps / CI-интеграции", "U2579613 / 7675623"),
        ("Загиров Алимагомед Мурадович", "Бизнес-аналитик · Продуктовый аналитик", "U1836974 / 4870356"),
        ("Омаров Алиасхаб Рабаданович", "Технический специалист · Бэкенд-разработчик, статический анализ", "U2579569 / 7369083"),
        ("Магомедов Руслан Шамильевич", "Дизайнер · Фронтенд-разработчик, UX/UI", "U2579575 / 7688556"),
    ]
    for i, (name, role, ids) in enumerate(team):
        y = 192 + i * 61
        rounded_card(s, 45, y, 571, 58)
        accent_bar(s, 57, y + 10, 10, 38)
        add_text(s, 74, y + 7, 420, 22, [
            {"text": name, "bold": True, "size": 13.2, "color": DARK}])
        add_text(s, 74, y + 31, 430, 18, [
            {"text": role, "size": 10.8, "color": GRAY}])
        add_text(s, 500, y + 10, 110, 16, [
            {"text": ids, "size": 9.5, "color": GRAY_L, "align": PP_ALIGN.RIGHT}])
    add_text(s, 49, 505, 700, 18, [
        {"text": "Компетенции команды: DevOps/CI · статический анализ · AppSec · backend/frontend · продуктовая аналитика",
         "size": 10, "color": ACCENT_D}])

    # ===================== 8. ПАРТНЕРЫ =====================
    s = new_slide("bg_08.png")
    add_text(s, 49, 136, 700, 26, [
        {"text": "Подтверждённых партнёрств в материалах нет", "bold": True, "size": 19, "color": DARK}])
    cards8 = [
        ("Пилотная ИТ-команда TechNet",
         "Реальный репозиторий и CI: разбор C/C++/Python-кода, сравнение с ручным ревью, метрики precision/recall, false positive и время ревью."),
        ("Экспертиза акселератора",
         "Технологический аудит, наставничество и консультации по пилоту (программа ДГУ TechNet)."),
        ("Учебная площадка EduNet — опционально, после TechNet-пилота",
         "Обезличенные работы и эталонные оценки преподавателей — только как дополнительный сценарий."),
    ]
    for i, (t, d) in enumerate(cards8):
        y = 182 + i * 88
        rounded_card(s, 45, y, 539, 84)
        accent_bar(s, 57, y + 15, 10, 54)
        add_text(s, 76, y + 8, 495, 32, [
            {"text": t, "bold": True, "size": 14, "color": DARK, "line_spacing": 1.05}])
        add_text(s, 76, y + 40, 495, 40, [
            {"text": d, "size": 11.5, "color": GRAY, "line_spacing": 1.1}])

    # ===================== 9. УГТ =====================
    s = new_slide("bg_09.png")
    add_text(s, 43, 119, 860, 22, [
        {"text": "В питче показан экран «живого демо»; протоколы испытаний не приложены.",
         "bold": True, "size": 15.5, "color": DARK}])
    chip = rounded_card(s, 55, 158, 196, 46, fill=PURPLE_HEAD, radius=0.14)
    add_text(s, 55, 171, 196, 24, [
        {"text": "Ориентир УГТ 4–6", "bold": True, "size": 15, "color": WHITE,
         "align": PP_ALIGN.CENTER}])
    add_text(s, 263, 163, 500, 40, [
        {"text": "Оценка по шкале шаблона, не подтверждённый официальный статус.",
         "size": 12.5, "color": GRAY, "space_after": 6},
        {"text": "EduNet — отдельный вторичный трек, не влияет на УГТ TechNet.",
         "size": 11, "color": ACCENT_D}])
    add_text(s, 43, 224, 500, 16, [
        {"text": "КАРТА ПОДТВЕРЖДЕНИЙ ПО ШКАЛЕ УГТ", "bold": True, "size": 10.4,
         "color": ACCENT_D}])
    data9 = [
        ["УГТ / этап", "Что есть сейчас", "Артефакт / следующий шаг"],
        ["1–3", "TechNet-сегмент, B2B-модель, сценарии CI/CD", "Питч: «Акселератор.pdf», с. 2–4"],
        ["4–6", "MVP-демо, стек, интеграция с Git/CI (заявлено)", "Скриншот демо; нужны протоколы метрик"],
        ["7", "Пилот в IT-команде: протоколы тестов, метрики, сравнение с ручным ревью",
         "Отчёт пилота пока не представлен"],
        ["8", "B2B-внедрение: SaaS / on-prem, договоры", "Акт приёмки не представлен"],
        ["9", "Серийные продажи B2B", "Договоры и отзывы не представлены"],
    ]
    add_table(s, 36, 255, [149, 348, 405], [38, 47, 47, 48, 47, 47], data9,
              header_fill=ORANGE_HEAD, header_size=11.5, body_size=11,
              col_aligns=["c", "l", "l"], highlight_row=2, highlight_color=ACCENT)

    # ===================== 10. ПРОГРЕСС =====================
    s = new_slide("bg_10.png")
    add_text(s, 51, 148, 820, 26, [
        {"text": "Данных «до / после» нет: фиксируем базу и план проверок.",
         "bold": True, "size": 18.5, "color": DARK}])
    add_text(s, 51, 186, 820, 20, [
        {"text": "Плановая веха не является уже достигнутым результатом.",
         "size": 12.5, "color": GRAY}])
    data10 = [
        ["Подтверждено материалами", "Целевой результат / план"],
        ["MVP заявлен, демо показано", "Метрики качества на реальных PR, adoption в CI"],
        ["Стек: Next.js, FastAPI, Docker", "Стабильный контур для пилота TechNet (CI/CD)"],
        ["TechNet — основной целевой сегмент; EduNet — вторичный",
         "CustDev с IT-командами: цена за repo/dev, ROI"],
        ["Партнёры пока не подтверждены", "Письма интереса и совместные пилоты"],
    ]
    add_table(s, 36, 240, [424, 424], [38, 46, 46, 62, 62], data10,
              header_fill=PURPLE_HEAD, header_size=13, body_size=12)

    # ===================== 11. ПЛАНЫ =====================
    s = new_slide("bg_11.png")
    add_text(s, 49, 137, 700, 26, [
        {"text": "Дорожная карта из исходного питча", "bold": True, "size": 18, "color": DARK}])
    plan = [
        ("1–2 мес.", "Проектирование и разработка MVP",
         "MVP + комментарии в PR/MR, CI-интеграция (GitHub/GitLab, SARIF)."),
        ("3-й мес.", "Тестирование и валидация",
         "Метрики на реальных PR: false positive, время ревью."),
        ("4–5 мес.", "Пилот и подготовка к B2B",
         "Пилот в ИТ-команде на реальном репозитории и CI."),
    ]
    for i, (date, t, d) in enumerate(plan):
        y = 179 + i * 91
        rounded_card(s, 44, y, 542, 86)
        chip = rounded_card(s, 56, y + 12, 118, 62, fill=ACCENT_D, radius=0.16)
        add_text(s, 56, y + 32, 118, 24, [
            {"text": date, "bold": True, "size": 14, "color": WHITE, "align": PP_ALIGN.CENTER}])
        add_text(s, 187, y + 11, 390, 24, [
            {"text": t, "bold": True, "size": 15, "color": DARK}])
        add_text(s, 187, y + 40, 390, 36, [
            {"text": d, "size": 12, "color": GRAY, "line_spacing": 1.1}])
    add_text(s, 49, 461, 820, 36, [
        {"text": "Дополнительно: методика испытаний, права на ПО и экономика внедрения.",
         "size": 11.5, "color": DARK, "space_after": 4},
        {"text": "Учебный поток EduNet — дополнительный кейс, если останутся ресурсы.",
         "size": 11, "color": ACCENT_D}])
    add_text(s, 48, 511, 620, 16, [
        {"text": "Сроки: «Акселератор.pdf», с. 5; дополнительные направления — предложение.",
         "size": 8.4, "color": GRAY_L}])

    # ===================== 12. ЗАПРОС =====================
    s = new_slide("bg_12.png")
    add_text(s, 49, 136, 720, 28, [
        {"text": "Нужен путь от демо к доказанному эффекту", "bold": True, "size": 19.5, "color": DARK}])
    cards12 = [
        ("01 Пилотные площадки",
         "ИТ-команда: CI/CD, PR-ревью, метрики качества и времени."),
        ("02 Независимая экспертиза",
         "Оценить ошибки, ложные срабатывания и безопасность метода."),
        ("03 Проверка B2B-модели",
         "Проверить B2B-модель; B2Edu — дополнительный сценарий."),
    ]
    for i, (t, d) in enumerate(cards12):
        y = 184 + i * 87
        rounded_card(s, 45, y, 557, 84)
        accent_bar(s, 57, y + 15, 10, 55)
        add_text(s, 76, y + 10, 515, 24, [
            {"text": t, "bold": True, "size": 15, "color": DARK}])
        add_text(s, 76, y + 38, 515, 36, [
            {"text": d, "size": 12.5, "color": GRAY, "line_spacing": 1.1}])
    add_text(s, 49, 456, 720, 20, [
        {"text": "Программа ДГУ TechNet заявляет обучение, наставничество и консалтинг.",
         "size": 11, "color": ACCENT_D}])

    # ===================== 13. ЭКСПЕРТНОЕ ЗАКЛЮЧЕНИЕ =====================
    s = new_slide("bg_13.png")
    add_text(s, 42, 145, 820, 34, [
        {"text": "Экспертиза — следующий контрольный шаг", "bold": True, "size": 25, "color": WHITE}])
    cards13 = [
        ("01", "Технология", "Реализуемость в CI/CD, интеграции, C/C++/Python"),
        ("02", "Рынок", "B2B DevTools/AppSec, ROI для IT-команд"),
        ("03", "Пилот", "Метрики в IT-команде"),
    ]
    for i, (num, t, d) in enumerate(cards13):
        x = 52 + i * 267
        rounded_card(s, x, 288, 248, 98, fill=DARK_CARD, line=DARK_CARD_BORDER, line_w=1.0)
        add_text(s, x + 16, 300, 30, 18, [
            {"text": num, "bold": True, "size": 11.5, "color": LIGHT_VIOLET}])
        add_text(s, x + 48, 298, 185, 24, [
            {"text": t, "bold": True, "size": 16.5, "color": WHITE}])
        add_text(s, x + 48, 325, 185, 46, [
            {"text": d, "size": 11, "color": LIGHT_VIOLET, "line_spacing": 1.12}])
    add_text(s, 55, 408, 720, 22, [
        {"text": "Научные принципы — в составе экспертизы по шаблону ДГУ. EduNet — вторичный сценарий, не ядро.",
         "size": 11, "color": LIGHT_VIOLET}])
    add_text(s, 55, 463, 500, 46, [
        {"text": "Исмаилов Ислам Шафикович", "bold": True, "size": 12.8,
         "color": WHITE, "space_after": 6},
        {"text": "aldarfgfg@gmail.com • +7 (928) 218-30-30", "size": 11.5, "color": LIGHT_VIOLET}])

    prs.save(OUT)
    print("saved:", OUT)


if __name__ == "__main__":
    build()
