#!/usr/bin/env python3
"""Build the SyntaxProof / DGU TechNet pitch deck from the supplied PDF template.

Content is intentionally conservative: estimates from the source pitch, project
plans, and facts proven by the supplied material are kept distinct. All newly
written text and tables remain editable in PowerPoint; template artwork is a
rasterised background because the supplied template is a PDF rather than PPTX.

Usage:
    python presentations/build_deck.py \
      --template '/path/to/Шаблон презентации 2.0_2026.pdf' \
      --source '/path/to/Акселератор.pdf'
Dependencies: pymupdf, python-pptx, pillow.
"""

from __future__ import annotations

import argparse
import tempfile
from pathlib import Path

import fitz
from PIL import Image, ImageDraw
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE, MSO_CONNECTOR
from pptx.enum.text import MSO_ANCHOR, MSO_AUTO_SIZE, PP_ALIGN
from pptx.util import Pt

ROOT = Path(__file__).resolve().parent
DEFAULT_TEMPLATE = Path('/tmp/arena-coding-uploads/Шаблон презентации 2.0_2026.pdf')
DEFAULT_SOURCE = Path('/tmp/arena-coding-uploads/Акселератор.pdf')
FONT_REG = Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
FONT_BOLD = Path('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf')
W, H = 960, 540
INK = '#1F1931'
MUTED = '#5A526C'
PURPLE = '#8423C1'
PLUM = '#57228A'
BORDER = '#D9CDE9'
WHITE = '#FFFFFF'
DARK_CARD = '#2A153B'
PROGRAM_URL = 'https://pt.2035.university/accelerator/747'
SONAR_URL = 'https://docs.sonarsource.com/sonarqube-server/quality-standards-administration/managing-rules/rules'
RABBIT_URL = 'https://docs.coderabbit.ai/guides/code-review-overview'
COPILOT_URL = 'https://docs.github.com/copilot/concepts/agents/coding-agent/about-coding-agent'


def rgb(value: str) -> RGBColor:
    value = value.lstrip('#')
    return RGBColor(int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16))


def pdf_rgb(value: str) -> tuple[float, float, float]:
    value = value.lstrip('#')
    return tuple(int(value[i:i + 2], 16) / 255.0 for i in (0, 2, 4))


def clean_template(source: Path) -> fitz.Document:
    """Delete *text* instructions, retaining original artwork, headings & table rules.

    PDF redaction with fill=False and graphics/images untouched is important here:
    a flat rectangle would destroy the template's soft gradients and illustrations.
    """
    document = fitz.open(source)
    if len(document) != 13 or any(abs(p.rect.width - W) > 1 or abs(p.rect.height - H) > 1 for p in document):
        raise ValueError('Ожидался 13-страничный PDF-шаблон 960×540.')
    for idx, page in enumerate(document):
        for block in page.get_text('dict')['blocks']:
            if block['type'] != 0:
                continue
            for line in block['lines']:
                for span in line['spans']:
                    x0, y0, x1, y1 = span['bbox']
                    if idx == 0:
                        remove = y0 > 150  # title/contact placeholders only
                    elif idx == 12:
                        # The first instruction line starts at y=115, so it must
                        # be removed too; only the title and page number remain.
                        remove = y0 > 105 and not (x0 > 915 and y0 > 498)
                    else:
                        remove = y0 > 107 and not (x0 > 915 and y0 > 498)
                    if remove:
                        page.add_redact_annot(fitz.Rect(x0, y0, x1, y1), fill=False)
        page.apply_redactions(images=0, graphics=0, text=0)
    return document


class Deck:
    def __init__(self, backgrounds: fitz.Document, scratch: Path):
        self.pdf = backgrounds
        self.pptx = Presentation()
        self.pptx.slide_width = Pt(W)
        self.pptx.slide_height = Pt(H)
        self.pptx.core_properties.title = 'СинтексПруф — акселератор ДГУ / TechNet'
        self.pptx.core_properties.subject = 'Питч проекта в шаблоне акселератора ДГУ'
        self.pptx.core_properties.author = 'Проект СинтексПруф'
        self.scratch = scratch
        self.font_regular = fitz.Font(fontfile=str(FONT_REG))
        self.font_bold = fitz.Font(fontfile=str(FONT_BOLD))
        self.slide = None
        self.page = None
        self.index = None
        self.warnings: list[str] = []

    def start(self, index: int):
        self.index = index
        self.page = self.pdf[index]
        self.page.insert_font(fontname='deckreg', fontfile=str(FONT_REG))
        self.page.insert_font(fontname='deckbold', fontfile=str(FONT_BOLD))
        png = self.scratch / f'background-{index + 1:02}.png'
        self.page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False).save(png)
        self.slide = self.pptx.slides.add_slide(self.pptx.slide_layouts[6])
        self.slide.shapes.add_picture(str(png), Pt(0), Pt(0), width=Pt(W), height=Pt(H))

    def rect(self, x, y, w, h, *, fill=WHITE, line=None, lw=0.8, rounded=True):
        shape = self.slide.shapes.add_shape(
            MSO_SHAPE.ROUNDED_RECTANGLE if rounded else MSO_SHAPE.RECTANGLE,
            Pt(x), Pt(y), Pt(w), Pt(h)
        )
        if rounded:
            try:
                shape.adjustments[0] = 0.11
            except (ValueError, IndexError):
                pass
        if fill:
            shape.fill.solid()
            shape.fill.fore_color.rgb = rgb(fill)
        else:
            shape.fill.background()
        if line:
            shape.line.color.rgb = rgb(line)
            shape.line.width = Pt(lw)
        else:
            shape.line.fill.background()
        self.page.draw_rect(fitz.Rect(x, y, x + w, y + h),
                            fill=pdf_rgb(fill) if fill else None,
                            color=pdf_rgb(line) if line else None, width=lw,
                            overlay=True)
        return shape

    def circle(self, x, y, diameter, *, fill=PURPLE, line=None):
        shape = self.slide.shapes.add_shape(MSO_SHAPE.OVAL, Pt(x), Pt(y), Pt(diameter), Pt(diameter))
        shape.fill.solid()
        shape.fill.fore_color.rgb = rgb(fill)
        if line:
            shape.line.color.rgb = rgb(line)
            shape.line.width = Pt(0.8)
        else:
            shape.line.fill.background()
        self.page.draw_oval(fitz.Rect(x, y, x + diameter, y + diameter),
                            fill=pdf_rgb(fill), color=pdf_rgb(line) if line else None, overlay=True)

    def line(self, x1, y1, x2, y2, color=BORDER, lw=1):
        shape = self.slide.shapes.add_connector(MSO_CONNECTOR.STRAIGHT, Pt(x1), Pt(y1), Pt(x2), Pt(y2))
        shape.line.color.rgb = rgb(color)
        shape.line.width = Pt(lw)
        self.page.draw_line(fitz.Point(x1, y1), fitz.Point(x2, y2), color=pdf_rgb(color), width=lw)

    def wrap(self, content: str, width: float, size: float, bold: bool) -> list[str]:
        font = self.font_bold if bold else self.font_regular
        lines = []
        for raw in content.split('\n'):
            if not raw:
                lines.append('')
                continue
            current = ''
            for word in raw.split(' '):
                trial = f'{current} {word}'.strip()
                if current and font.text_length(trial, fontsize=size) > width - 3:
                    lines.append(current)
                    current = word
                else:
                    current = trial
            lines.append(current)
        return lines

    def text(self, x, y, w, content, *, size=16, color=INK, bold=False,
             leading=1.28, align='left', link=None, max_lines=None):
        lines = self.wrap(str(content), w, size, bold)
        if max_lines is not None and len(lines) > max_lines:
            self.warnings.append(f'слайд {self.index + 1}: слишком много строк ({len(lines)}>{max_lines}) в «{content[:45]}»')
        font = self.font_bold if bold else self.font_regular
        for ln in lines:
            if font.text_length(ln, fontsize=size) > w + 0.5:
                self.warnings.append(f'слайд {self.index + 1}: строка вышла за ширину: {ln}')
        line_height = size * leading
        box = self.slide.shapes.add_textbox(Pt(x), Pt(y), Pt(w), Pt(line_height * max(1, len(lines)) + 3))
        tf = box.text_frame
        tf.clear()
        tf.margin_top = tf.margin_bottom = tf.margin_left = tf.margin_right = Pt(0)
        tf.vertical_anchor = MSO_ANCHOR.TOP
        tf.auto_size = MSO_AUTO_SIZE.NONE
        tf.word_wrap = False
        p = tf.paragraphs[0]
        p.alignment = {'left': PP_ALIGN.LEFT, 'center': PP_ALIGN.CENTER, 'right': PP_ALIGN.RIGHT}[align]
        p.space_before = p.space_after = Pt(0)
        p.line_spacing = Pt(line_height)
        run = p.add_run()
        run.text = '\v'.join(lines)
        run.font.name = 'Arial'
        run.font.size = Pt(size)
        run.font.bold = bold
        run.font.color.rgb = rgb(color)
        if link:
            run.hyperlink.address = link
        for i, ln in enumerate(lines):
            if align == 'center':
                left = x + (w - font.text_length(ln, fontsize=size)) / 2
            elif align == 'right':
                left = x + w - font.text_length(ln, fontsize=size)
            else:
                left = x
            self.page.insert_text((left, y + i * line_height + size * 0.97), ln,
                                  fontsize=size, fontname='deckbold' if bold else 'deckreg',
                                  color=pdf_rgb(color), overlay=True)
        if link:
            self.page.insert_link({'kind': fitz.LINK_URI,
                                   'from': fitz.Rect(x, y, x + w, y + line_height * len(lines)),
                                   'uri': link})
        return len(lines) * line_height

    def image(self, path: Path, x, y, w, h):
        self.slide.shapes.add_picture(str(path), Pt(x), Pt(y), width=Pt(w), height=Pt(h))
        self.page.insert_image(fitz.Rect(x, y, x + w, y + h), filename=str(path), overlay=True)

    def footer(self, content, *, x=48, y=512, size=8.5, color=MUTED, link=None):
        self.text(x, y, 847, content, size=size, color=color, link=link, leading=1.0, max_lines=1)

    def card(self, x, y, w, h, title, body, *, title_size=17, body_size=13.4,
             accent=PURPLE, fill=WHITE, title_y=13, body_y=42):
        self.rect(x, y, w, h, fill=fill, line=BORDER, lw=0.75)
        self.rect(x + 12, y + 15, 4, h - 30, fill=accent, rounded=False)
        self.text(x + 27, y + title_y, w - 42, title, size=title_size, bold=True, max_lines=2)
        self.text(x + 27, y + body_y, w - 44, body, size=body_size, color=MUTED, max_lines=3)

    def export(self, pptx_path: Path, pdf_path: Path):
        self.pptx.save(pptx_path)
        self.pdf.set_metadata({
            'title': 'СинтексПруф — TechNet / акселератор ДГУ',
            'author': 'Проект СинтексПруф',
            'subject': 'Питч проекта на основе приложенного PDF и страницы программы',
        })
        self.pdf.save(pdf_path, garbage=4, deflate=True)
        print('Создано:', pptx_path, f'({pptx_path.stat().st_size / 1024 / 1024:.1f} МиБ)')
        print('Создано:', pdf_path, f'({pdf_path.stat().st_size / 1024 / 1024:.1f} МиБ)')
        print('Предупреждения верстки:', len(self.warnings))
        for warning in self.warnings:
            print(' !', warning)


def make_deck(deck: Deck, mvp: Path) -> None:
    # 1 — cover. The original PDF title placeholders were removed; the logos
    # and golden curve belong to the provided template and are untouched.
    deck.start(0)
    deck.text(48, 172, 520, 'ПРОЕКТ АКСЕЛЕРАТОРА ДГУ  /  TECHNET', size=13.5, color='#E4CBFA', bold=True)
    deck.text(48, 229, 700, 'СинтексПруф', size=44, color=WHITE, bold=True)
    deck.text(50, 297, 665, 'Платформа статического анализа\nи ИИ-ревью программного кода', size=20, color=WHITE, leading=1.34)
    deck.text(49, 452, 640, 'Исмаилов Ислам Шафикович', size=16, color=WHITE, bold=True)
    deck.text(49, 481, 740, 'StevenScreamches@ya.ru    •    +7 (928) 218-30-30', size=13.2, color=WHITE)
    deck.footer('Источник: «Акселератор.pdf», с. 1, 6  •  Программа ДГУ TechNet',
                color='#DDD2E9', x=49, y=519, size=8.2)

    # 2 — problem / pain points: keep the template's purple outline.
    deck.start(1)
    # The source template left a gap in the upper border for its prompt text.
    deck.line(33, 165, 324, 165, color='#8900CC', lw=2.5)
    deck.text(48, 180, 849, 'Проверка кода не масштабируется вместе с потоком работ',
              size=21, bold=True)
    deck.card(47, 231, 276, 176, 'Команды разработки',
              'Ручной Code Review занимает время опытных инженеров и задерживает обратную связь.',
              title_size=17, body_size=13.3)
    deck.card(342, 231, 276, 176, 'Образование',
              'Одних тестов мало для оценки памяти, алгоритмов и самостоятельности решения.',
              title_size=17, body_size=13.3)
    deck.card(637, 231, 276, 176, 'ИИ-генерация кода',
              'Предложенный LLM код может содержать ошибки, слабые места и лишнюю сложность.',
              title_size=17, body_size=13.3)
    deck.text(49, 436, 839,
              'В исходном питче указано до 20–30% времени Senior/Lead на Code Review;'
              '\nметодика измерения и подтверждающие данные не приложены.',
              size=12.3, color=PLUM, max_lines=2)
    deck.footer('Источник: «Акселератор.pdf», с. 2. Оценка 20–30% — тезис исходного питча, не проверенный замер.',
                size=8.0)

    # 3 — product and actual demo screenshot extracted from source page 3.
    deck.start(2)
    deck.text(49, 137, 661, 'От дефекта — к понятному объяснению', size=23, bold=True)
    deck.text(49, 174, 692, 'Детерминированная проверка + ИИ-разбор: риски, асимптотика'
              '\nи замечания с привязкой к строкам кода.', size=15.5, color=MUTED, max_lines=2)
    deck.rect(47, 216, 570, 284, fill=WHITE, line=BORDER, lw=1.3)
    deck.image(mvp, 53, 222, 558, 276)
    deck.rect(645, 218, 248, 74, fill=WHITE, line=BORDER)
    deck.text(659, 227, 218, 'Заявленная цель', size=14.6, bold=True)
    deck.text(659, 252, 218, 'Отличать код человека от LLM;'
              '\nточность ещё не подтверждена.', size=10.6, color=PLUM, leading=1.28, max_lines=2)
    deck.footer('Иллюстрация MVP: «Акселератор.pdf», с. 3 (из исходного файла, не новый результат тестирования).',
                y=514, size=8.0)

    # 4 — technological core.
    deck.start(3)
    deck.text(49, 138, 568, 'Правила сначала. ИИ — для объяснения.', size=20.5, bold=True)
    steps = [
        ('01', 'Ввод', 'Исходный код C, C++ или Python'),
        ('02', 'Анализ', 'Статические проверки и выявление дефектов'),
        ('03', 'ИИ-ревью', 'Интерпретация риска и качества решения'),
        ('04', 'Отчёт', 'Приоритет и замечания по строкам'),
    ]
    for j, (number, heading, detail) in enumerate(steps):
        y = 181 + j * 68
        deck.rect(49, y, 487, 60, fill=WHITE, line=BORDER)
        deck.circle(61, y + 12, 36, fill=PURPLE)
        deck.text(67, y + 19, 25, number, size=12, color=WHITE, bold=True, align='center')
        deck.text(109, y + 9, 400, heading, size=15.5, bold=True)
        deck.text(109, y + 33, 410, detail, size=12.6, color=MUTED)
    deck.text(50, 460, 502, 'Стек из питча: React / Next.js • Python / FastAPI • Docker',
              size=11.3, color=PLUM)
    deck.footer('Источник стека: «Акселератор.pdf», с. 5; схема — представление продукта из питча.', size=8.2)

    # 5 — comparison grounded in official product descriptions, not benchmark claims.
    deck.start(4)
    deck.text(44, 131, 856, 'Позиционирование: ревью кода для TechNet и EduNet', size=19.2, bold=True)
    deck.text(44, 160, 854, 'Сравнение сценариев по открытым описаниям, без измерения точности и цены.',
              size=12.8, color=MUTED)
    xs = [42, 232, 402, 572, 742]
    widths = [190, 170, 170, 170, 170]
    table_y = 216
    headers = [
        'Критерий', 'СинтексПруф\nпроект ДГУ', 'SonarQube\nSonarSource, Швейцария',
        'CodeRabbit\nСША', 'Copilot Review\nGitHub, США'
    ]
    for x, width, header in zip(xs, widths, headers):
        deck.rect(x, table_y, width, 55, fill=PLUM, line=WHITE, lw=0.6, rounded=False)
        deck.text(x + 9, table_y + 10, width - 18, header, size=11.6 if x == 402 else 12.0,
                  color=WHITE, bold=True, leading=1.14, max_lines=3)
    table_rows = [
        ['Назначение', 'Проверка кода\nи учебных работ', 'Качество и\nбезопасность ПО', 'ИИ-ревью\npull requests', 'ИИ-ревью\npull requests'],
        ['Основной подход', 'Правила + ИИ\n(заявлено)', 'Правила; AI CodeFix\nдля ряда задач', 'ИИ + статические\nинструменты', 'ИИ-обратная\nсвязь'],
        ['Рабочий процесс', 'Загрузка кода,\nотчёт по строкам', 'Анализ проекта,\nсписок issues', 'Коммиты и\npull requests', 'PR и IDE'],
    ]
    for row_index, cells in enumerate(table_rows):
        y = table_y + 55 + row_index * 61
        fill = '#F4F0F9' if row_index % 2 == 0 else WHITE
        for col_index, (x, width, value) in enumerate(zip(xs, widths, cells)):
            deck.rect(x, y, width, 61, fill=fill, line=BORDER, lw=0.6, rounded=False)
            deck.text(x + 9, y + 11, width - 16, value,
                      size=11.8 if col_index else 12.0,
                      color=INK, bold=(col_index == 0), leading=1.21, max_lines=3)
    deck.text(44, 465, 850, 'Вывод: преимущество в учебном сценарии — гипотеза; нужны'
              '\nсопоставимые испытания по качеству, времени и стоимости.',
              size=11.5, color=PLUM, max_lines=2)
    # Individual linked source labels work in both the PDF and the PPTX.
    x = 48.0
    for label, url in [
        ('Источники: «Акселератор.pdf»  •  ', None),
        ('SonarQube Docs', SONAR_URL),
        ('  •  ', None),
        ('CodeRabbit Docs', RABBIT_URL),
        ('  •  ', None),
        ('GitHub Docs', COPILOT_URL),
        ('  (окт. 2026)', None),
    ]:
        segment_width = deck.font_regular.text_length(label, fontsize=8.1) + 3
        deck.text(x, 516, segment_width, label, size=8.1, color=MUTED, link=url, leading=1.0)
        x += segment_width

    # 6 — segmentation and *hypothesis* of pricing, not a fabricated TAM/SOM.
    deck.start(5)
    deck.text(48, 131, 705, 'Кто использует и кто может платить', size=20.7, bold=True)
    deck.card(48, 177, 564, 83, 'TechNet  /  ИТ-команды',
              'Первичный фильтр перед ручным ревью; покупатель — руководитель разработки.',
              title_size=16.2, body_size=12.8, title_y=10, body_y=38)
    deck.card(48, 270, 564, 83, 'EduNet  /  преподаватели',
              'Потоковая проверка работ и понятная обратная связь обучающимся.',
              title_size=16.2, body_size=12.8, title_y=10, body_y=38)
    deck.card(48, 363, 564, 83, 'HR  /  обучающие программы',
              'Разбор тестовых заданий и сопоставимая оценка решений кандидатов.',
              title_size=16.2, body_size=12.8, title_y=10, body_y=38)
    deck.rect(48, 459, 591, 42, fill='#F3E6FC', line=BORDER, rounded=True)
    deck.text(61, 469, 571, 'Гипотеза: B2B/B2Edu-подписка; цену и размер рынка уточнят пилоты.',
              size=12.1, color=PLUM, bold=True)
    deck.footer('Сегменты из «Акселератор.pdf», с. 4; модель оплаты — гипотеза, не факт продаж.', y=516, size=8.2)

    # 7 — only the named contact is presented as a team member; no invented CV.
    deck.start(6)
    deck.text(49, 135, 613, 'В исходных материалах указан один контакт проекта',
              size=17.2, bold=True)
    deck.rect(49, 184, 536, 138, fill=WHITE, line=BORDER)
    deck.text(67, 200, 488, 'Исмаилов Ислам Шафикович', size=21.2, bold=True)
    deck.text(67, 234, 490, 'Контакт проекта «СинтексПруф»', size=15.2, color=PLUM)
    deck.text(67, 264, 494, 'StevenScreamches@ya.ru\n+7 (928) 218-30-30',
              size=13.2, color=MUTED, leading=1.34)
    deck.card(49, 341, 536, 105, 'Компетенции для усиления',
              'Инженерия анализа кода · ИИ/ML · продукт и B2B-пилоты',
              title_size=16.2, body_size=13.2, title_y=11, body_y=44)
    deck.text(51, 461, 548, 'Вуз, курс, опыт и полный состав команды в источниках не приведены.',
              size=11.4, color=MUTED)
    deck.footer('Источник контактов: «Акселератор.pdf», с. 6. Роли для усиления — предложение.', size=8.2)

    # 8 — do NOT mistake illustrative brand logos in the old pitch for partners.
    deck.start(7)
    deck.text(49, 136, 618, 'Подтверждённых партнёрств в материалах нет',
              size=19.0, bold=True)
    deck.card(49, 184, 532, 80, 'Пилотная ИТ-команда TechNet',
              'Нужен разбор реального C/C++/Python-кода и сравнение с ручным ревью.',
              title_size=15.8, body_size=12.4, title_y=9, body_y=37)
    deck.card(49, 272, 532, 80, 'Учебная площадка EduNet',
              'Нужны обезличенные работы и эталонные оценки преподавателей.',
              title_size=15.8, body_size=12.4, title_y=9, body_y=37)
    deck.card(49, 360, 532, 80, 'Экспертиза акселератора',
              'Технологический аудит, наставничество и консультации по пилоту.',
              title_size=15.8, body_size=12.4, title_y=9, body_y=37)
    deck.text(50, 453, 579, 'Логотипы из исходного слайда обозначали аудиторию, не партнёров.',
              size=11.2, color=PLUM)
    deck.footer('Источники: «Акселератор.pdf», с. 4–5; описание программы: pt.2035.university/accelerator/747.',
                y=516, size=8.0, link=PROGRAM_URL)

    # 9 — original TRL table remains as vector artwork; its example text was removed.
    deck.start(8)
    deck.text(43, 119, 879, 'В питче показан экран «живого демо»; протоколы испытаний не приложены.',
              size=16.2, bold=True)
    deck.rect(43, 162, 205, 39, fill=PLUM, line=PLUM)
    deck.text(57, 171, 175, 'Ориентир УГТ 4–6', size=15.1, color=WHITE, bold=True)
    deck.text(263, 164, 642, 'Оценка по шкале шаблона, не подтверждённый официальный статус.'
              '\nПилот, метрики точности и отзывы ещё необходимо документировать.',
              size=12.8, color=MUTED, max_lines=2)
    deck.text(43, 225, 864, 'КАРТА ПОДТВЕРЖДЕНИЙ ПО ШКАЛЕ УГТ', size=10.4, color=PLUM, bold=True)
    deck.text(44, 260, 133, 'УГТ / этап', size=12.1, bold=True)
    deck.text(191, 260, 323, 'Что есть сейчас', size=12.1, bold=True)
    deck.text(538, 260, 371, 'Артефакт / следующий шаг', size=12.1, bold=True)
    trl_rows = [
        (300, '1–3', 'Концепция, сегменты и модель решения', 'Питч: «Акселератор.pdf», с. 2–4'),
        (348, '4–6', 'Экран «живого демо» и стек MVP', 'Скриншот, с. 3; нужны протоколы метрик'),
        (395, '7', 'Пилот заявлен как план на 4–5-й месяц', 'Отчёт пилота пока не представлен'),
        (442, '8', 'Коммерческое внедрение не заявлено', 'Акт приёмки не представлен'),
        (490, '9', 'Продажи не заявлены', 'Договоры и отзывы не представлены'),
    ]
    for y, level, status, artifact in trl_rows:
        deck.text(44, y, 126, level, size=12.0, bold=(level == '4–6'))
        deck.text(191, y, 332, status, size=11.7, color=INK, max_lines=2)
        deck.text(538, y, 379, artifact, size=11.7, color=INK, max_lines=2)
    # Thin outline highlights the evidenced-prototype row without obscuring template rules.
    deck.rect(36, 343, 898, 47, fill=None, line=PURPLE, lw=1.6, rounded=False)

    # 10 — no invented before/after acceleration results.
    deck.start(9)
    deck.text(51, 149, 852, 'Данных «до / после» нет: фиксируем базу и план проверок.',
              size=19.0, bold=True)
    deck.text(51, 187, 838, 'Плановая веха не является уже достигнутым результатом.',
              size=13.0, color=PLUM)
    deck.text(53, 260, 382, 'Подтверждено материалами', size=14.6, color=WHITE, bold=True)
    deck.text(462, 260, 386, 'Целевой результат / план', size=14.6, color=WHITE, bold=True)
    progress_rows = [
        (298, 'MVP заявлен, демо показано', 'Протоколы тестов и метрики качества'),
        (347, 'Стек: Next.js, FastAPI, Docker', 'Стабильный контур для пилота'),
        (396, 'TechNet и EduNet — целевые сегменты', 'CustDev, проверка цены и спроса'),
        (445, 'Партнёры пока не подтверждены', 'Письма интереса и совместные пилоты'),
    ]
    for y, left, right in progress_rows:
        deck.text(53, y, 384, left, size=12.8, max_lines=2)
        deck.text(462, y, 384, right, size=12.8, max_lines=2)
    deck.footer('Основа: «Акселератор.pdf», с. 3–5; правая колонка — план, не отчёт о достижениях.',
                y=515, size=8.2)

    # 11 — timeline from source page 5; follow-on actions explicitly proposed.
    deck.start(10)
    deck.text(49, 137, 600, 'Дорожная карта из исходного питча', size=18.0, bold=True)
    roadmap = [
        ('1–2 мес.', 'Проектирование и разработка MVP', 'Загрузка кода и читаемый отчёт по замечаниям.'),
        ('3-й мес.', 'Тестирование и валидация', 'Эталонные задачи, ложные срабатывания, UX.'),
        ('4–5 мес.', 'Пилот и подготовка к B2B', 'Проверка сценария в ИТ-команде и на учебном потоке.'),
    ]
    for index, (period, heading, detail) in enumerate(roadmap):
        y = 181 + index * 91
        deck.rect(48, y, 535, 79, fill=WHITE, line=BORDER)
        deck.rect(60, y + 12, 111, 55, fill='#F3E6FC', line=None)
        deck.text(67, y + 28, 98, period, size=14.5, color=PLUM, bold=True, align='center')
        deck.text(187, y + 10, 373, heading, size=15.4, bold=True)
        deck.text(187, y + 39, 374, detail, size=12.4, color=MUTED, max_lines=2)
    deck.text(49, 465, 566, 'Дополнительно: методика испытаний, права на ПО и экономика внедрения.',
              size=11.6, color=PLUM)
    deck.footer('Сроки: «Акселератор.pdf», с. 5; дополнительные направления — предложение.',
                y=515, size=8.4)

    # 12 — ask matches what the accelerator page actually says it offers.
    deck.start(11)
    deck.text(49, 136, 648, 'Нужен путь от демо к доказанному эффекту', size=19.4, bold=True)
    deck.card(49, 186, 550, 78, '01   Пилотные площадки',
              'ИТ-команда и учебный курс: измерить качество и время ревью.',
              title_size=15.4, body_size=12.6, title_y=9, body_y=38)
    deck.card(49, 273, 550, 78, '02   Независимая экспертиза',
              'Оценить ошибки, ложные срабатывания и безопасность метода.',
              title_size=15.4, body_size=12.6, title_y=9, body_y=38)
    deck.card(49, 360, 550, 78, '03   Менторство и консультации',
              'Проверить B2B/B2Edu-модель и подготовить коммерческий пилот.',
              title_size=15.4, body_size=12.6, title_y=9, body_y=38)
    deck.text(49, 457, 588, 'Программа ДГУ TechNet заявляет обучение, наставничество и консалтинг.',
              size=11.3, color=PLUM)
    deck.footer('Описание программы ДГУ TechNet: pt.2035.university/accelerator/747',
                y=516, size=8.8, link=PROGRAM_URL)

    # 13 — expert conclusions are required by the template but absent in the
    # supplied material. Explicitly call out the gap instead of inventing quotes.
    deck.start(12)
    deck.text(55, 145, 839, 'Экспертиза — следующий контрольный шаг',
              size=25.5, color=WHITE, bold=True)
    deck.text(55, 201, 827, 'В переданных материалах не приложены экспертные отзывы.'
              '\nЦитаты, ФИО и ссылки на профили здесь не подменяются вымыслом.',
              size=16.0, color='#F4E9FC', max_lines=2)
    criteria = [
        ('01', 'Технология', 'теоретическая\nреализуемость'),
        ('02', 'Рынок', 'коммерческий\nпотенциал'),
        ('03', 'Наука', 'соответствие\nпринципам'),
    ]
    for i, (n, title, detail) in enumerate(criteria):
        x = 56 + i * 267
        deck.rect(x, 290, 241, 91, fill=DARK_CARD, line='#B875D5', lw=1.0)
        deck.text(x + 14, 302, 29, n, size=12.0, color='#D38DEF', bold=True)
        deck.text(x + 48, 300, 181, title, size=17.0, color=WHITE, bold=True)
        deck.text(x + 48, 327, 181, detail, size=12.0, color='#E1D3ED', max_lines=2)
    deck.rect(53, 401, 856, 48, fill=DARK_CARD, line='#9254B1', lw=0.8)
    deck.text(66, 414, 830, 'Для финальной подачи: 5 заключений с ФИО и ссылками на ИС «Эксперты НТИ».',
              size=14.2, color=WHITE, bold=True)
    deck.text(55, 465, 485, 'Исмаилов Ислам Шафикович',
              size=12.8, color='#F4E9FC', bold=True)
    deck.text(55, 488, 470, 'StevenScreamches@ya.ru  •  +7 (928) 218-30-30',
              size=11.5, color='#F4E9FC')
    deck.footer('Требования к экспертизе: «Шаблон презентации 2.0_2026.pdf», с. 13.',
                x=55, y=517, size=8.0, color='#D8C7E3')


def make_preview(pdf_path: Path, out_path: Path) -> None:
    doc = fitz.open(pdf_path)
    cols = 3
    cell_w, cell_h = 620, 380
    rows = (len(doc) + cols - 1) // cols
    board = Image.new('RGB', (cols * cell_w, rows * cell_h), '#E3DBF0')
    draw = ImageDraw.Draw(board)
    for idx, page in enumerate(doc):
        pix = page.get_pixmap(matrix=fitz.Matrix(0.61, 0.61), alpha=False)
        im = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
        x, y = (idx % cols) * cell_w + 14, (idx // cols) * cell_h + 10
        board.paste(im, (x, y))
        draw.text((x + 4, y + 338), f'{idx + 1:02d}', fill='#432064')
    board.save(out_path)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--template', type=Path, default=DEFAULT_TEMPLATE)
    parser.add_argument('--source', type=Path, default=DEFAULT_SOURCE)
    parser.add_argument('--output-dir', type=Path, default=ROOT)
    parser.add_argument('--preview', type=Path, help='Опционально: путь к обзорной таблице слайдов PNG')
    args = parser.parse_args()
    for pdf in [args.template, args.source]:
        if not pdf.is_file():
            parser.error(f'PDF не найден: {pdf}')
    args.output_dir.mkdir(parents=True, exist_ok=True)
    clean = clean_template(args.template)
    with tempfile.TemporaryDirectory(prefix='deck-') as temp:
        scratch = Path(temp)
        source = fitz.open(args.source)
        if len(source) < 6:
            raise ValueError('PDF проекта должен содержать не менее 6 страниц.')
        images = source[2].get_images(full=True)
        screenshot_xref = next((it[0] for it in images if it[2] >= 1500 and it[3] >= 700 and it[3] < 1000), None)
        if screenshot_xref is None:
            raise ValueError('Не удалось найти скриншот MVP на странице 3 исходного PDF.')
        extracted = source.extract_image(screenshot_xref)
        mvp = scratch / ('mvp.' + extracted['ext'])
        mvp.write_bytes(extracted['image'])
        deck = Deck(clean, scratch)
        make_deck(deck, mvp)
        stem = 'СинтексПруф_TechNet_ДГУ_2026'
        pptx = args.output_dir / f'{stem}.pptx'
        pdf = args.output_dir / f'{stem}.pdf'
        deck.export(pptx, pdf)
        if args.preview:
            args.preview.parent.mkdir(parents=True, exist_ok=True)
            make_preview(pdf, args.preview)


if __name__ == '__main__':
    main()
