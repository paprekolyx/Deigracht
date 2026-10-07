#!/usr/bin/env node
/* Deigracht — смоук-тест парсера (tests/parser-smoke.js), волна v0.1.0.
   Запуск:  node tests/parser-smoke.js   (Node >= 16, без зависимостей).
   Проверяет: safeUrl-вектора (SECURITY §2), AST синтетического документа
   (все типы блоков v0.1.0, XSS-инертность), метрики эталона
   data/etalon/etalon-sint.md — синтетической структурной копии эталонного
   документа владельца (текст — генерация «ааа ббб», блок-каркас и метрики —
   точная копия; решение владельца 07.10.2026: авторский текст не публикуется.
   Регресс-приёмка, регламент §8.4 — значения заморожены в metrika.md).
   DOM не нужен: тестируются чистые функции config.js/util.js/parser.js/
   blocks.js (tocHeading)/toc.js. Рендер-проверки конвейера — с wave v0.4.1
   в tests/render-smoke.js (DOM-заглушка, АН-27).
   Вектора v0.4.1 (rev040): Н-03 (ATX-префикс строк ручного TOC), Н-06
   (некорректный auto-диапазон — badRange), Н-09/ответ В-3 (safeUrl:
   отклонение `//host`, mailto в whitelist), Н-10 (внутрисловный `_` —
   литерал по GFM), Н-05 (спецификации авто-TOC — только блоки {{toc…}}).
   Код выхода 0 = зелёный. */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

global.window = global;
const root = path.join(__dirname, '..');
for (const f of ['config.js', 'util.js', 'parser.js', 'blocks.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(root, 'assets/js', f), 'utf8'),
    { filename: f });
}
const { safeUrl, countWords } = global.DG.util;
const { parse, parseInline } = global.DG.parser;
const { tocHeading } = global.DG.blocks;

let fails = 0, passes = 0;
function is(name, cond, extra) {
  if (cond) { passes++; }
  else { fails++; console.log('  FAIL', name, extra !== undefined ? extra : ''); }
}
function eq(name, a, b) { is(name, JSON.stringify(a) === JSON.stringify(b), `получено ${JSON.stringify(a)}, ожидалось ${JSON.stringify(b)}`); }
function hasType(nodes, t) {
  return (nodes || []).some(n => n.t === t || hasType(n.in, t));
}

/* ---------- 1. safeUrl (XSS/схемы; v0.4.1 — Н-09/ответ В-3) ---------- */
is('safeUrl: javascript: отклоняется', safeUrl('javascript:alert(1)') === null);
is('safeUrl: java\\tscript: отклоняется (управляющие символы)', safeUrl('java\tscript:alert(1)') === null);
is('safeUrl: JaVaScRiPt: отклоняется (регистр)', safeUrl('JaVaScRiPt:alert(1)') === null);
is('safeUrl: data: отклоняется', safeUrl('data:text/html,<script>') === null);
is('safeUrl: vbscript: отклоняется', safeUrl('vbscript:x') === null);
is('safeUrl: https разрешён', safeUrl('https://example.com/a.png') === 'https://example.com/a.png');
is('safeUrl: http разрешён', safeUrl('http://example.com') === 'http://example.com');
is('safeUrl: якорь разрешён', safeUrl('#p2') === '#p2');
is('safeUrl: пробелы вокруг http вычищаются', safeUrl('  https://ok.example  ') === 'https://ok.example');
is('Н-09: protocol-relative //evil.com/x отклоняется', safeUrl('//evil.com/x') === null, safeUrl('//evil.com/x'));
is('В-3: mailto разрешён (whitelist — ответ владельца 07.10.2026)',
  safeUrl('mailto:mail@example.com') === 'mailto:mail@example.com');
is('В-3: mailto регистронезависим', safeUrl('MAILTO:a@b.c') === 'MAILTO:a@b.c');
is('safeUrl: относительный /a.png разрешён', safeUrl('/a.png') === '/a.png');
is('countWords', countWords('привет мир! hello') === 3);

/* ---------- 2. синтетический документ ---------- */
const synth = [
  '```metadata',
  'title: Тест',
  'renderer: V3',
  '```',
  '',
  '# Заголовок 1',
  '',
  'Текст с **жирным**, *курсивом*, ***обоим***, `кодом`, [ссылкой](https://e.com), ![инлайн](https://e.com/i.png) и <img src=x onerror=alert(1)>.',
  '',
  '___',
  '',
  '> цитата',
  '',
  '- пункт 1',
  '- пункт 2',
  '  - вложенный',
  '',
  '1. один',
  '2. два',
  '',
  '| A | B |',
  '|:--|--:|',
  '| 1 \\| pipe | 2 |',
  '',
  '```js',
  'code fence',
  '```',
  '',
  '![подпись](https://e.com/fig.png)',
  '',
  '{{note',
  'содержимое врезки **bold**',
  '}}',
  '',
  '{{pageNumber,auto}}',
  '',
  '\\page',
  '',
  '## Вторая страница',
  '',
  '{{wide',
  'без закрытия',
].join('\n');

const d = parse(synth);
eq('meta.title', d.meta && d.meta.title, 'Тест');
eq('meta.renderer', d.meta && d.meta.renderer, 'V3');

const types = d.blocks.map(b => b.t);
eq('порядок блоков', types, [
  'heading', 'para', 'hr', 'quote', 'list', 'list', 'table', 'code',
  'imgfig', 'v3', 'v3', 'pagebreak', 'heading', 'v3'
]);

eq('heading lvl', d.blocks[0].lvl, 1);
const pIn = d.blocks[1].in.map(n => n.t);
is('инлайны абзаца содержат b/i/bi/code/a/img', ['b', 'i', 'bi', 'code', 'a', 'img'].every(t => pIn.includes(t)), pIn.join(','));
is('XSS-инертность: HTML-тег остался текстом',
  d.blocks[1].in.some(n => n.t === 'text' && n.v.includes('<img src=x')));
is('AST не содержит «сырого HTML»-типа', !pIn.includes('html'));
eq('hr kind', d.blocks[2].kind, '_');

const list1 = d.blocks[4];
eq('список 1 — неупорядоченный, 2 элемента', [list1.ordered, list1.items.length], [false, 2]);
is('вложенный подсписок', list1.items[1].sub && list1.items[1].sub.items.length === 1);
eq('список 2 — упорядоченный', d.blocks[5].ordered, true);

const tbl = d.blocks[6];
eq('таблица: выравнивание', tbl.align, ['left', 'right']);
eq('таблица: заголовок', tbl.head.map(c => c[0].v), ['A', 'B']);
eq('таблица: экранированный | в ячейке', tbl.rows[0][0].map(n => n.v).join(''), '1 | pipe');
eq('код-блок', [d.blocks[7].lang, d.blocks[7].text], ['js', 'code fence']);
eq('imgfig', [d.blocks[8].alt, d.blocks[8].src], ['подпись', 'https://e.com/fig.png']);

const note = d.blocks[9];
eq('v3 note: mods/closed/body', [note.modsRaw, note.closed, note.body.length], ['note', true, 1]);
eq('v3 note: вложенный bold', note.body[0].in.some(n => n.t === 'b'), true);
const pn = d.blocks[10];
eq('v3 однострочный pageNumber,auto', [pn.modsRaw, pn.closed, pn.body.length], ['pageNumber,auto', true, 0]);
eq('pagebreak', d.blocks[11].t, 'pagebreak');
eq('heading после \\page', d.blocks[12].t, 'heading');
const wide = d.blocks[13];
eq('v3 незакрытый wide', [wide.modsRaw, wide.closed], ['wide', false]);

/* ---------- 2б. блоки V3: AST (волна v0.2.0) ---------- */
const v3doc = parse([
  '{{note', 'текст **врезки**', '}}', '',
  '{{column-count:3', 'три колонки', '}}', '',
  '{{toc,wide', '- [{{ Раздел}}{{ 2}}](#p2)', '}}', '',
  '{{monster', '#### Имя', '___', 'черта', '}}', '',
  '{{imageMaskEdge6,--offset:45%', '  ![x](https://e.com/i.png) {width:100%}', '}}', '',
  '{{unknownmod', 'текст', '}}'
].join('\n'));
eq('v3: порядок modsRaw', v3doc.blocks.map(b => b.modsRaw),
  ['note', 'column-count:3', 'toc,wide', 'monster', 'imageMaskEdge6,--offset:45%', 'unknownmod']);
eq('v3: все закрыты', v3doc.blocks.every(b => b.closed), true);
eq('v3: monster содержит h4 + hr + p', v3doc.blocks[3].body.map(b => b.t), ['heading', 'hr', 'para']);
eq('v3: monster h4 уровень', v3doc.blocks[3].body[0].lvl, 4);
eq('v3: imageMask содержит инлайн-картинку', v3doc.blocks[4].body[0].in.some(n => n.t === 'img'), true);

/* ---------- 2г. инлайн `_` на границах слов (волна v0.4.1, rev040-Н10) ---------- */
is('Н-10: значение_курсив_значение — литерал (нет курсива)',
  !hasType(parseInline('значение_курсив_значение'), 'i'));
is('Н-10: snake_case_var — литерал (GFM)',
  !hasType(parseInline('snake_case_var'), 'i') && !hasType(parseInline('snake_case_var'), 'b'));
is('Н-10 регресс: _курсив_ на границе — курсив', hasType(parseInline('_курсив_'), 'i'));
is('Н-10 регресс: __жирный__ — жирный', hasType(parseInline('__жирный__'), 'b'));
is('Н-10: пунктуация перед `_` — граница слова', hasType(parseInline('(_в скобках_)'), 'i'));
is('Н-10 регресс: `*звёздочки*` границ не требуют (внутри слова)',
  hasType(parseInline('слово*курсив*слово'), 'i'));

/* ---------- 2д. ATX-префикс строк ручного TOC (волна v0.4.1, rev040-Н03) ---------- */
eq('Н-03: tocHeading снимает префикс «#### »', tocHeading('#### Раздел 1'), { lvl: 4, text: 'Раздел 1' });
eq('Н-03: tocHeading — 6 уровней', tocHeading('###### x'), { lvl: 6, text: 'x' });
eq('Н-03: tocHeading без префикса — lvl 0', tocHeading('[{{ Раздел }}{{ 2 }}](#p2)'),
  { lvl: 0, text: '[{{ Раздел }}{{ 2 }}](#p2)' });
eq('Н-03: 7 решёток — не префикс (граница ATX)', tocHeading('####### семь'),
  { lvl: 0, text: '####### семь' });

/* ---------- 2в. fuzz: парсер не падает (волна v0.2.0, DoD «полный фаззинг») ---------- */
const fuzzCases = [
  '', '   ', '\n\n\n', '{{', '}}', '{{note', '{{note\nбез закрытия',
  '```\nнезакрытый fence', '#', '######', '####### семь',
  '|', '| a |\n|', '| a |\n|-|\n| 1 |\n', '![alt](', '[текст](',
  '**незакрытый жирный', '*незакрытый', '***', '___\n___\n___',
  '\\page\\page', '{{column-count:99\nx\n}}', '{{column-count:0\nx\n}}',
  '{{pageNumber,auto', '<script>alert(1)<\/script>', '<img src=x onerror=alert(1)>',
  'javascript:alert(1)', '{{wide\n' + 'слово '.repeat(3000) + '\n}}',
  'а'.repeat(20000), '- '.repeat(500), '\u0000\u0001 управляющие',
  '{{вложенный{{блок}}', 'текст с {{фигурными}} внутри строки'
];
for (const fc of fuzzCases) {
  let okFlag = true;
  try {
    const r = parse(fc);
    JSON.stringify(r.blocks);
    if (!Array.isArray(r.blocks)) okFlag = false;
  } catch (e) { okFlag = false; console.log('  fuzz упал на:', JSON.stringify(fc.slice(0, 40)), e.message); }
  is('fuzz: ' + JSON.stringify(fc.slice(0, 24)), okFlag);
}

/* ---------- 3. эталон: замороженные метрики (metrika.md) ---------- */
const etalonPath = path.join(root, 'data/etalon/etalon-sint.md');
if (!fs.existsSync(etalonPath)) {
  console.log('  FAIL эталон не найден:', etalonPath);
  fails++;
} else {
  const src = fs.readFileSync(etalonPath, 'utf8');
  const ed = parse(src);

  function walk(blocks, acc) {
    for (const b of blocks) {
      acc.all++;
      if (b.t === 'heading') acc.headings[b.lvl] = (acc.headings[b.lvl] || 0) + 1;
      if (b.t === 'pagebreak') acc.pagebreaks++;
      if (b.t === 'imgfig') acc.images++;
      if (b.t === 'hr' && b.kind === '_') acc.rules++;
      if (b.t === 'table') {
        acc.tables++;
        acc.tableRows += b.rows.length;
        acc.tableHeadRows += b.head ? 1 : 0;
        acc.tableSepRows += (b.head && b.align && b.align.length) ? 1 : 0;
      }
      if (b.t === 'v3') {
        acc.v3++;
        const mod = String(b.modsRaw || '').split(/[,;]/)[0].split(':')[0].trim().toLowerCase();
        acc.v3mods[mod] = (acc.v3mods[mod] || 0) + 1;
        if (!b.closed) acc.v3unclosed++;
        walk(b.body, acc);
      }
      if (b.t === 'para' || b.t === 'quote') {
        for (const n of b.in) if (n.t === 'img') acc.imagesInline++;
      }
      if (b.t === 'list') {
        for (const it of b.items) {
          for (const n of it.in) if (n.t === 'img') acc.imagesInline++;
          if (it.sub) walk([it.sub], acc);
        }
      }
    }
    return acc;
  }
  const acc = walk(ed.blocks, {
    all: 0, headings: {}, pagebreaks: 0, images: 0, imagesInline: 0,
    rules: 0, tables: 0, tableRows: 0, tableHeadRows: 0, tableSepRows: 0,
    v3: 0, v3mods: {}, v3unclosed: 0
  });

  eq('эталон: \\page', acc.pagebreaks, 49);
  eq('эталон: заголовки h1', acc.headings[1] || 0, 2);
  eq('эталон: заголовки h2', acc.headings[2] || 0, 26);
  eq('эталон: заголовки h3', acc.headings[3] || 0, 82);
  eq('эталон: заголовки h4', acc.headings[4] || 0, 144);
  eq('эталон: заголовки h5', acc.headings[5] || 0, 98);
  eq('эталон: заголовки h6', acc.headings[6] || 0, 139);
  eq('эталон: картинки (блок+инлайн) = 9', acc.images + acc.imagesInline, 9);
  eq('эталон: строки ___ = 3', acc.rules, 3);
  eq('эталон: строки таблиц (данные+заголовки+сепараторы) = 577',
    acc.tableRows + acc.tableHeadRows + acc.tableSepRows, 577);
  eq('эталон: незакрытых v3-блоков = 0', acc.v3unclosed, 0);
  eq('эталон: v3 pageNumber', acc.v3mods['pagenumber'] || 0, 51);
  eq('эталон: v3 note', acc.v3mods['note'] || 0, 30);
  eq('эталон: v3 column-count', acc.v3mods['column-count'] || 0, 17);
  eq('эталон: v3 wide', acc.v3mods['wide'] || 0, 9);
  eq('эталон: v3 descriptive', acc.v3mods['descriptive'] || 0, 3);
  eq('эталон: v3 monster', acc.v3mods['monster'] || 0, 3);
  eq('эталон: v3 toc', acc.v3mods['toc'] || 0, 1);
  const masks = Object.keys(acc.v3mods).filter(k => k.startsWith('imagemask'))
    .reduce((s, k) => s + acc.v3mods[k], 0);
  eq('эталон: v3 imageMask* (все виды)', masks, 9);
  console.log('  INFO эталон: таблиц', acc.tables,
    '(данных', acc.tableRows, '+ заголовков', acc.tableHeadRows,
    '+ сепараторов', acc.tableSepRows + ')',
    '| v3 всего', acc.v3, '| блоков всех', acc.all,
    '| imgfig', acc.images, '+ инлайн-картинок', acc.imagesInline,
    '| символов', src.length, '| байт', Buffer.byteLength(src),
    '| строк', src.split('\n').length);
}

/* ---------- 4. автооглавление (toc.js, волны v0.4.0/v0.4.1) ---------- */
/* DOM не нужен: тестируется чистая логика состава; карта страниц
   (pagesFromDom/collect) и рендер оглавлений — в tests/render-smoke.js. */
vm.runInThisContext(fs.readFileSync(path.join(root, 'assets/js', 'toc.js'), 'utf8'),
  { filename: 'toc.js' });
const toc = global.DG.toc;
eq('toc.parseSpec: дефолт auto = уровни 3-3', toc.parseSpec('toc,auto'),
  { auto: true, from: 3, to: 3, badRange: false });
eq('toc.parseSpec: диапазон 1-3', toc.parseSpec('toc,auto:1-3'),
  { auto: true, from: 1, to: 3, badRange: false });
eq('toc.parseSpec: один уровень', toc.parseSpec('toc,auto:2'),
  { auto: true, from: 2, to: 2, badRange: false });
eq('toc.parseSpec: обратный диапазон разворачивается', toc.parseSpec('toc,auto:4-2'),
  { auto: true, from: 2, to: 4, badRange: false });
eq('toc.parseSpec: ручной toc не тронут', toc.parseSpec('toc,wide'),
  { auto: false, from: 3, to: 3, badRange: false });
/* rev040-Н06: некорректный диапазон — auto:true + badRange (честная плашка),
   однозначные 0/9 clamp\'ятся (Ф-03) */
eq('Н-06: auto:10 — badRange (многоразрядное не clamp\'ится молча)',
  toc.parseSpec('toc,auto:10'), { auto: true, from: 3, to: 3, badRange: true });
eq('Н-06: auto:2- — badRange (обрыв диапазона)', toc.parseSpec('toc,auto:2-'),
  { auto: true, from: 3, to: 3, badRange: true });
eq('Н-06: auto:x — badRange (мусор)', toc.parseSpec('toc,auto:x'),
  { auto: true, from: 3, to: 3, badRange: true });
eq('Н-06 регресс: auto:0 — clamp в 1 (Ф-03)', toc.parseSpec('toc,auto:0'),
  { auto: true, from: 1, to: 1, badRange: false });
eq('Н-06 регресс: auto:9 — clamp в 6 (Ф-03)', toc.parseSpec('toc,auto:9'),
  { auto: true, from: 6, to: 6, badRange: false });
/* rev040-Н05: спецификации авто-TOC — только блоки {{toc…}};
   {{pageNumber,auto}} оглавлением не является */
eq('Н-05: findAllSpecs — {{pageNumber,auto}} не спецификация',
  toc.findAllSpecs(parse('{{pageNumber,auto}}\n\ntext\n').blocks).length, 0);
eq('Н-05: findAllSpecs — два разных диапазона = две спецификации',
  toc.findAllSpecs(parse('{{toc,auto:1}}\n\n{{toc,auto:3}}\n').blocks)
    .map(s => toc.specKey(s)), ['1-1', '3-3']);
eq('Н-05: findAllSpecs — дубли диапазона схлопываются',
  toc.findAllSpecs(parse('{{toc,auto:2}}\n\n{{toc,auto:2}}\n').blocks).length, 1);
eq('Н-06: findAllSpecs — badRange не участвует в сходимости',
  toc.findAllSpecs(parse('{{toc,auto:10}}\n').blocks).length, 0);
eq('toc.textOf: разметка снимается',
  toc.textOf(parse('## Глава **первая** `код`\n').blocks[0].in), 'Глава первая код');
eq('toc.textOf: вложенные инлайны сохраняют краевые пробелы (правка v0.4.1)',
  toc.textOf(parseInline('*****ггг** ууу ууу ююю.***')), '*ггг ууу ууу ююю.*');
eq('toc.collectHeadings: вложенные в V3 не входят',
  toc.collectHeadings(parse('{{monster\n### Действия\n}}\n# Часть\n## Раздел\n').blocks),
  [{ lvl: 1, text: 'Часть' }, { lvl: 2, text: 'Раздел' }]);
eq('toc.buildEntries: фильтр уровней и номер страницы',
  toc.buildEntries([{ lvl: 2, text: 'А' }, { lvl: 3, text: 'Б' }], [5, 7],
    toc.parseSpec('toc,auto')),
  [{ lvl: 3, text: 'Б', hid: 1, page: 7 }]);
/* DoD волны 4: автосостав эталона = состав ручного TOC владельца
   (82 записи = h3; метрики эталона заморожены: metrika.md, fp №11) */
const etalonSrc4 = fs.readFileSync(
  path.join(root, 'data/etalon/etalon-sint.md'), 'utf8');
const etalonBlocks = parse(etalonSrc4).blocks;
eq('DoD fp №11: автосостав эталона (h3) = 82 = ручной TOC владельца',
  toc.buildEntries(toc.collectHeadings(etalonBlocks), [], toc.parseSpec('toc,auto')).length, 82);
const manualToc = etalonBlocks.find(b => b.t === 'v3' && /^toc\b/.test(b.modsRaw));
is('эталон: ручной {{toc}} на месте (ручной режим поддержан)', !!manualToc);

console.log('='.repeat(56));
console.log(`ИТОГ: ${passes} OK, ${fails} FAIL → ${fails ? 'КРАСНЫЙ' : 'ЗЕЛЁНЫЙ'}`);
process.exit(fails ? 1 : 0);
