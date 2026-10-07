#!/usr/bin/env node
/* Deigracht — смоук-тест парсера (tests/parser-smoke.js), волна v0.1.0.
   Запуск:  node tests/parser-smoke.js   (Node >= 16, без зависимостей).
   Проверяет: safeUrl-вектора (SECURITY §2), AST синтетического документа
   (все типы блоков v0.1.0, XSS-инертность), метрики эталона
   data/etalon/vsemirnaya-istoriya.md (регресс-приёмка, регламент §8.4 —
   ожидаемые значения заморожены в data/etalon/metrika.md).
   DOM не нужен: тестируются config.js/util.js/parser.js (чистые данные).
   Код выхода 0 = зелёный. */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

global.window = global;
const root = path.join(__dirname, '..');
for (const f of ['config.js', 'util.js', 'parser.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(root, 'assets/js', f), 'utf8'),
    { filename: f });
}
const { safeUrl, countWords } = global.DG.util;
const { parse } = global.DG.parser;

let fails = 0, passes = 0;
function is(name, cond, extra) {
  if (cond) { passes++; }
  else { fails++; console.log('  FAIL', name, extra !== undefined ? extra : ''); }
}
function eq(name, a, b) { is(name, JSON.stringify(a) === JSON.stringify(b), `получено ${JSON.stringify(a)}, ожидалось ${JSON.stringify(b)}`); }

/* ---------- 1. safeUrl (XSS/схемы) ---------- */
is('safeUrl: javascript: отклоняется', safeUrl('javascript:alert(1)') === null);
is('safeUrl: java\\tscript: отклоняется (управляющие символы)', safeUrl('java\tscript:alert(1)') === null);
is('safeUrl: JaVaScRiPt: отклоняется (регистр)', safeUrl('JaVaScRiPt:alert(1)') === null);
is('safeUrl: data: отклоняется', safeUrl('data:text/html,<script>') === null);
is('safeUrl: vbscript: отклоняется', safeUrl('vbscript:x') === null);
is('safeUrl: https разрешён', safeUrl('https://example.com/a.png') === 'https://example.com/a.png');
is('safeUrl: http разрешён', safeUrl('http://example.com') === 'http://example.com');
is('safeUrl: якорь разрешён', safeUrl('#p2') === '#p2');
is('safeUrl: пробелы вокруг http вычищаются', safeUrl('  https://ok.example  ') === 'https://ok.example');
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

/* ---------- 3. эталон: замороженные метрики (metrika.md) ---------- */
const etalonPath = path.join(root, 'data/etalon/vsemirnaya-istoriya.md');
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

console.log('='.repeat(56));
console.log(`ИТОГ: ${passes} OK, ${fails} FAIL → ${fails ? 'КРАСНЫЙ' : 'ЗЕЛЁНЫЙ'}`);
process.exit(fails ? 1 : 0);
