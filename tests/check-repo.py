#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Deigracht — автоматическая проверка целостности репозитория (АН-01).

Запуск:  python3 tests/check-repo.py   (из корня репозитория или откуда
угодно — корень определяется по расположению скрипта). Без сети и БД.
Код выхода 0 = зелёный (индикатор качества волны — регламент §8.1).

Состав проверок v1.0 (реестр §7.1, регламент §8.2):
  1. REQUIRED-файлы и каталоги;
  2. версии: SITE_VERSION (config.js) = шапки README/SECURITY/LICENSE;
  3. хронология таблицы версий README (грабля №2);
  4. MD-документы: один H1 (грабля №1), без CJK-включений (грабля №10),
     без опечатки «графля»;
  5. упоминания сторонних проектов — только docs/plan/otchet.md (грабля №8);
  6. прежнее рабочее имя — только в разрешённых исторических файлах;
  7. локальность ресурсов HTML: script/link/img — относительные пути,
     файлы существуют (нет hotlink/CDN);
  8. пары JS↔HTML и CSS↔HTML (все модули подключены, все ссылки живы);
  9. сбалансированность парных тегов HTML;
 10. шаблоны секретов (регламент §9.1);
 11. шрифты: woff2 >= 16, OFL-тексты = 4, manifest.json, fonts.css ссылается
     только на существующие файлы;
 12. data/etalon: эталон и метрики на месте, эталон непустой.

История (шапка-комментарий — правило реестра §7.1):
  v1.0 (0.1.0-draft): первый состав — 12 групп проверок (волна v0.1.0);
    REQUIRED включает tests/parser-smoke.js (регресс эталона — метрики в
    data/etalon/metrika.md).
  v1.2 (0.1.2-draft): REQUIRED — .nojekyll в корне (отключение Jekyll на
    GitHub Pages: синтаксис V3 `{{…}}` конфликтует с Liquid, волна v0.1.2).
  v1.1 (0.1.1-draft): REQUIRED — data/etalon/etalon-sint.md вместо копии
    документа владельца (решение владельца 07.10.2026: авторский текст
    не публикуется — синтетическая структурная копия; грабля №12 регламента).
"""

import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

FAILURES = []
PASSES = []


def ok(msg):
    PASSES.append(msg)


def fail(check, msg):
    FAILURES.append(f'[{check}] {msg}')


def rel(p):
    return os.path.relpath(p, ROOT).replace(os.sep, '/')


def read(p, binary=False):
    with open(p, 'rb' if binary else 'r', encoding=None if binary else 'utf-8') as f:
        return f.read()


# ---------------------------------------------------------------- 1. REQUIRED
REQUIRED = [
    'README.md', 'LICENSE.md', 'SECURITY.md', '.gitignore', '.nojekyll',
    'index.html', '404.html',
    'docs/reglament.md', 'docs/reestr.md', 'docs/tehpasport.md',
    'docs/feature-proposals.md',
    'docs/plan/plan-razrabotki.md', 'docs/plan/otchet.md',
    'docs/plan/voprosy-vladeltsu.md',
    'docs/update/update-v001.md', 'docs/update/update-v002.md',
    'docs/update/update-v003.md', 'docs/update/update-v010.md',
    'docs/update/update-v011.md',
    'docs/setup/setup-repo-pages.md',
    'assets/css/fonts.css', 'assets/css/tokens.css', 'assets/css/editor.css',
    'assets/css/theme-book.css', 'assets/css/print.css',
    'assets/js/config.js', 'assets/js/util.js', 'assets/js/parser.js',
    'assets/js/blocks.js', 'assets/js/render.js', 'assets/js/pages.js',
    'assets/js/editor.js', 'assets/js/storage.js', 'assets/js/pdf.js',
    'assets/img/parchment.svg', 'assets/img/favicon.svg',
    'assets/fonts/manifest.json',
    'data/etalon/etalon-sint.md', 'data/etalon/metrika.md',
    'tests/check-repo.py', 'tests/parser-smoke.js',
]

missing = [r for r in REQUIRED if not os.path.exists(os.path.join(ROOT, r))]
if missing:
    fail('1.REQUIRED', 'нет файлов: ' + ', '.join(missing))
else:
    ok(f'1.REQUIRED: {len(REQUIRED)} файлов на месте')

# ------------------------------------------------------------- 2. версии
cfg = read(os.path.join(ROOT, 'assets/js/config.js')) if 'assets/js/config.js' not in missing else ''
m = re.search(r"SITE_VERSION\s*=\s*'([^']+)'", cfg)
if not m:
    fail('2.версии', 'SITE_VERSION не найден в config.js')
else:
    ver = m.group(1)
    bad = []
    for doc in ('README.md', 'SECURITY.md', 'LICENSE.md'):
        p = os.path.join(ROOT, doc)
        if os.path.exists(p):
            head = read(p)[:900]
            if ver not in head:
                bad.append(doc)
    if bad:
        fail('2.версии', f'SITE_VERSION={ver} отсутствует в шапках: {", ".join(bad)}')
    else:
        ok(f'2.версии: SITE_VERSION={ver} синхронна с README/SECURITY/LICENSE')

# ------------------------------------------- 3. хронология таблицы версий README
readme_p = os.path.join(ROOT, 'README.md')
if os.path.exists(readme_p):
    rows = re.findall(r'(?m)^\|\s*(\d+)\.(\d+)\.(\d+)-draft\s*\|', read(readme_p))
    tuples = [tuple(int(x) for x in r) for r in rows]
    if not tuples:
        fail('3.хронология', 'таблица версий README пуста/не найдена')
    elif tuples != sorted(tuples):
        fail('3.хронология', f'нарушен порядок строк: {tuples}')
    else:
        ok(f'3.хронология: {len(tuples)} строк, порядок верный')

# --------------------------------------------- 4-6. MD-документы (кроме эталона)
SISKU_OK = {'docs/plan/otchet.md'}
GRIMOIRE_OK = {
    'docs/update/update-v001.md', 'docs/update/update-v002.md',
    'docs/setup/setup-repo-pages.md', 'docs/plan/otchet.md',
}
CJK = re.compile(r'[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]')

md_files = []
for dp, dn, fn in os.walk(ROOT):
    dn[:] = [d for d in dn if d not in ('.git', 'node_modules', 'etalon')]
    for f in fn:
        if f.endswith('.md'):
            md_files.append(os.path.join(dp, f))

problems4, problems5, problems6 = [], [], []
for p in md_files:
    r = rel(p)
    s = read(p)
    h1 = len(re.findall(r'(?m)^# ', s))
    if h1 != 1:
        problems4.append(f'{r}: H1={h1}')
    if CJK.search(s):
        problems4.append(f'{r}: CJK-включение')
    if 'графл' in s.lower():
        problems4.append(f'{r}: опечатка «графля»')
    if re.search(r'sisku', s, re.I) and r not in SISKU_OK:
        problems5.append(r)
    if 'Grimoire' in s and r not in GRIMOIRE_OK:
        problems6.append(r)

fail('4.MD', '; '.join(problems4)) if problems4 else ok(f'4.MD: {len(md_files)} документов — H1/CJK/опечатки чисто')
fail('5.сторонние проекты', 'упоминания вне otchet.md: ' + ', '.join(problems5)) if problems5 else ok('5.сторонние проекты: только otchet.md')
fail('6.прежнее имя', '«Grimoire» вне разрешённых: ' + ', '.join(problems6)) if problems6 else ok('6.прежнее имя: только исторические файлы')

# ------------------------------------------- 7-8. ресурсы HTML, пары JS/CSS↔HTML
html_files = ['index.html', '404.html']
res_fail = []
referenced_js, referenced_css = set(), set()
for hf in html_files:
    p = os.path.join(ROOT, hf)
    if not os.path.exists(p):
        continue
    s = read(p)
    for m2 in re.finditer(r'<script[^>]+src="([^"]+)"', s):
        src = m2.group(1)
        if re.match(r'^(https?:)?//', src):
            res_fail.append(f'{hf}: внешний script {src}')
        elif not os.path.exists(os.path.join(ROOT, src)):
            res_fail.append(f'{hf}: нет файла {src}')
        else:
            referenced_js.add(src)
    for m2 in re.finditer(r'<link[^>]+href="([^"]+)"', s):
        href = m2.group(1)
        if re.match(r'^(https?:)?//', href):
            res_fail.append(f'{hf}: внешний link {href}')
        elif not os.path.exists(os.path.join(ROOT, href)):
            res_fail.append(f'{hf}: нет файла {href}')
        elif href.endswith('.css'):
            referenced_css.add(href)
    for m2 in re.finditer(r'<img[^>]+src="([^"]+)"', s):
        src = m2.group(1)
        if src.startswith('data:'):
            continue
        if re.match(r'^(https?:)?//', src):
            res_fail.append(f'{hf}: внешний img {src}')
        elif not os.path.exists(os.path.join(ROOT, src)):
            res_fail.append(f'{hf}: нет файла {src}')

fail('7.локальность', '; '.join(res_fail)) if res_fail else ok('7.локальность: все ресурсы HTML локальны и существуют')

js_dir = os.path.join(ROOT, 'assets/js')
all_js = {f'assets/js/{f}' for f in os.listdir(js_dir)} if os.path.isdir(js_dir) else set()
orphan_js = all_js - referenced_js
if orphan_js:
    fail('8.пары', 'JS не подключён ни к одной странице: ' + ', '.join(sorted(orphan_js)))
else:
    ok(f'8.пары: все {len(all_js)} JS-модулей подключены; CSS-ссылок: {len(referenced_css)}')

# --------------------------------------------------- 9. баланс парных тегов HTML
STRICT_TAGS = ['div', 'section', 'main', 'header', 'footer', 'nav', 'label',
               'button', 'span', 'table', 'textarea', 'script', 'style']
bal_fail = []
for hf in html_files:
    p = os.path.join(ROOT, hf)
    if not os.path.exists(p):
        continue
    s = read(p)
    for t in STRICT_TAGS:
        o = len(re.findall(rf'<{t}[\s>]', s))
        c = len(re.findall(rf'</{t}>', s))
        if o != c:
            bal_fail.append(f'{hf}: <{t}> {o}/{c}')
fail('9.теги', '; '.join(bal_fail)) if bal_fail else ok('9.теги: парные теги сбалансированы')

# ------------------------------------------------------------- 10. секреты
SECRET_PATTERNS = [
    (r'service_role', 'service_role'),
    (r'apikey\s*[=:]\s*["\'][A-Za-z0-9_\-]{16,}', 'apikey'),
    (r'BEGIN [A-Z ]*PRIVATE KEY', 'private key'),
    (r'sk-[A-Za-z0-9]{20,}', 'sk-токен'),
    (r'password\s*=\s*["\'][^"\']{6,}["\']', 'password='),
]
sec_fail = []
for dp, dn, fn in os.walk(ROOT):
    dn[:] = [d for d in dn if d not in ('.git', 'node_modules')]
    for f in fn:
        r = rel(os.path.join(dp, f))
        if r == 'tests/check-repo.py' or r.startswith('docs/'):
            continue  # сам скрипт и документы (описания правил) — вне скана
        if not f.endswith(('.js', '.css', '.html', '.json', '.svg', '.md')):
            continue
        try:
            s = read(os.path.join(dp, f))
        except UnicodeDecodeError:
            continue
        for pat, name in SECRET_PATTERNS:
            if re.search(pat, s, re.I):
                sec_fail.append(f'{r}: {name}')
fail('10.секреты', '; '.join(sec_fail)) if sec_fail else ok('10.секреты: шаблонов секретов нет')

# --------------------------------------------------------------- 11. шрифты
fonts_dir = os.path.join(ROOT, 'assets/fonts')
woff = [f for f in os.listdir(fonts_dir) if f.endswith('.woff2')] if os.path.isdir(fonts_dir) else []
ofl = [f for f in os.listdir(fonts_dir) if f.startswith('OFL-') and f.endswith('.txt')] if os.path.isdir(fonts_dir) else []
font_fail = []
if len(woff) < 16:
    font_fail.append(f'woff2: {len(woff)} (<16)')
if len(ofl) != 4:
    font_fail.append(f'OFL-текстов: {len(ofl)} (!=4)')
fonts_css = os.path.join(ROOT, 'assets/css/fonts.css')
if os.path.exists(fonts_css):
    for u in re.findall(r"url\('\.\./fonts/([^']+)'\)", read(fonts_css)):
        if not os.path.exists(os.path.join(fonts_dir, u)):
            font_fail.append(f'fonts.css ссылается на отсутствующий {u}')
fail('11.шрифты', '; '.join(font_fail)) if font_fail else ok(f'11.шрифты: {len(woff)} woff2, {len(ofl)} OFL, ссылки fonts.css живы')

# ------------------------------------------------------------- 12. эталон
et1 = os.path.join(ROOT, 'data/etalon/etalon-sint.md')
et2 = os.path.join(ROOT, 'data/etalon/metrika.md')
et_fail = []
if os.path.exists(et1):
    size = os.path.getsize(et1)
    if size < 100000:
        et_fail.append(f'эталон подозрительно мал: {size} байт')
else:
    et_fail.append('нет эталона')
if not os.path.exists(et2):
    et_fail.append('нет metrika.md')
fail('12.эталон', '; '.join(et_fail)) if et_fail else ok('12.эталон: файл и метрики на месте')

# ------------------------------------------------------------------- итог
print('=' * 62)
for p in PASSES:
    print('  PASS', p)
if FAILURES:
    print('-' * 62)
    for f in FAILURES:
        print('  FAIL', f)
print('=' * 62)
print(f'ИТОГ: {"ЗЕЛЁНЫЙ (exit 0)" if not FAILURES else "КРАСНЫЙ (exit 1)"} — '
      f'{len(PASSES)} групп OK, {len(FAILURES)} провалов')
sys.exit(0 if not FAILURES else 1)
