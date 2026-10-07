#!/usr/bin/env node
/* Deigracht — смоук-тест рендера (tests/render-smoke.js), волна v0.4.1
   (АН-27 — принятие харнесса внешнего ревьюера rev040 в tests/).
   Запуск:  node tests/render-smoke.js   (Node >= 16, без зависимостей).
   Проверяет конвейер parser → render → blocks/toc → pages структурно,
   на минимальной DOM-заглушке (tests/dom-stub.js, БЕЗ layout: переполнения
   и геометрия не моделируются — визуальная приёмка браузером, регламент
   §8.4). Assert-форма: проверки соответствуют «исправленному» состоянию
   (инверсия проверок 1–4 харнесса run-checks.js ревьюера — журнал
   review-v040-recheck, запись 7):
   - Н-01: тело {{column-count:N …}} присутствует в развороте (сниппет,
     демо справки, все абзацы эталона);
   - Н-02: директива колонок не создаёт пустых страниц;
   - Н-03: строки ручного TOC без литерального `####` (+ класс уровня);
   - Н-04: демо справки — авто-TOC с записями, абзацы целы, честные тексты;
   - Н-05: два авто-диапазона сходятся без ложного предупреждения;
   - Н-06: {{toc,auto:10}} — плашка «некорректный диапазон уровней»;
   - Н-07: DG.config.siteVersion; Н-08: демо первого запуска соответствует
     волне; Н-09/В-3: safeUrl — `//` отклоняется, mailto разрешён;
   - Н-10: внутрисловный `_` — литерал (GFM); В-12: списки 5 уровней.
   Код выхода 0 = зелёный (индикатор волны — регламент §8.1). */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { Element, makeDocument } = require('./dom-stub.js');

const root = path.join(__dirname, '..');
global.window = global;
global.document = makeDocument();
global.requestAnimationFrame = function (fn) { fn(); };

/* порядок загрузки браузером (index.html); editor.js не грузится —
   требует полной DOM (textarea, модалка), вне области структурных проверок */
for (const f of ['config.js', 'util.js', 'parser.js', 'blocks.js', 'render.js',
                 'toc.js', 'pages.js', 'snippets.js', 'help.js', 'storage.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(root, 'assets/js', f), 'utf8'),
    { filename: f });
}

let fails = 0, passes = 0;
function is(name, cond, extra) {
  if (cond) { passes++; }
  else { fails++; console.log('  FAIL', name, extra !== undefined ? JSON.stringify(extra) : ''); }
}
function eq(name, a, b) {
  is(name, JSON.stringify(a) === JSON.stringify(b),
    `получено ${JSON.stringify(a)}, ожидалось ${JSON.stringify(b)}`);
}
function norm(s) { return String(s).replace(/\s+/g, ' ').trim(); }
function hasType(nodes, t) {
  return (nodes || []).some(n => n.t === t || hasType(n.in, t));
}

/* двухпроходный цикл рендера — копия editor.js/help.js */
function renderLoop(srcText, wrap) {
  const doc = DG.parser.parse(srcText);
  DG.pages.docTitle = (doc.meta && doc.meta.title) || 'T';
  DG.toc.reset(DG.toc.collectHeadings(doc.blocks));
  let res = null, pass = 0, stable = false;
  while (pass < 3 && !stable) {
    const items = DG.render.blocksToItems(doc.blocks);
    res = DG.pages.paginate(items, wrap);
    stable = DG.toc.collect(doc.blocks, wrap);
    pass++;
  }
  return { doc, res, pass, stable };
}
function pageTexts(wrap) {
  return wrap.querySelectorAll('.page').map(p => ({
    num: p.getAttribute('data-page'),
    cols: p.getAttribute('data-cols'),
    text: norm(p.querySelector('.page-body').textContent)
  }));
}

/* ---------- 1. rev040-Н01: тело {{column-count}} не теряется ---------- */
{
  const wrap = new Element('div');
  renderLoop('{{column-count:1\nТЕЛО-ВНУТРИ-ДИРЕКТИВЫ\n}}\n\nПОСЛЕ-ДИРЕКТИВЫ', wrap);
  const pages = pageTexts(wrap);
  is('Н-01: текст внутри {{column-count:1 …}} присутствует в развороте',
    pages.some(p => p.text.includes('ТЕЛО-ВНУТРИ-ДИРЕКТИВЫ')), pages);
  is('Н-01: тело выложено на странице с cols=1',
    pages.some(p => p.cols === '1' && p.text.includes('ТЕЛО-ВНУТРИ-ДИРЕКТИВЫ')), pages);
  is('Н-01: текст после директивы не потерян',
    pages.some(p => p.text.includes('ПОСЛЕ-ДИРЕКТИВЫ')), pages);
}
{
  const snip = DG.snippets.list().find(s => s.id === 'cols');
  const wrap = new Element('div');
  renderLoop(snip.text + '\nКонец.', wrap);
  is('Н-01: сниппет «Одна колонка» рендерит собственный текст',
    wrap.textContent.includes('Текст в одну колонку'), snip.text);
}

/* ---------- 2. rev040-Н02: нет пустых страниц ---------- */
{
  const wrap = new Element('div');
  renderLoop('Первая страница текст.\n\n\\page\n{{column-count:1}}\nТекст главы.', wrap);
  const pages = pageTexts(wrap);
  is('Н-02: `\\page` + {{column-count}} подряд — без пустой страницы между ними',
    pages.length > 0 && pages.every(p => p.text), pages);
  is('Н-02: страница после директивы — cols=1',
    pages.some(p => p.cols === '1' && p.text.includes('Текст главы')), pages);
}
{
  const wrap = new Element('div');
  renderLoop('{{column-count:3}}\nТекст.', wrap);
  const pages = pageTexts(wrap);
  is('Н-02: {{column-count}} первым блоком — нет пустой страницы №1',
    pages.length === 1 && pages[0].cols === '3' && pages[0].text.includes('Текст.'), pages);
}

/* ---------- 3. rev040-Н03: ручной TOC без «####» ---------- */
{
  const src = '{{toc,wide\n  - #### [{{ Раздел 1 }}{{ 2 }}](#p2)\n  - [{{ Без префикса }}{{ 4 }}](#p4)\n}}';
  const wrap = new Element('div');
  renderLoop(src, wrap);
  const nav = wrap.querySelector('.block-toc');
  const lis = nav ? nav.querySelectorAll('li') : [];
  is('Н-03: строка ручного TOC без литерального «####»',
    lis.length === 2 && !lis[0].textContent.includes('####'),
    lis.map(li => li.textContent));
  is('Н-03: титул и номер страницы сохранены',
    lis.length === 2 && lis[0].textContent.includes('Раздел 1') &&
    lis[0].textContent.includes('2'), lis.length ? lis[0].textContent : null);
  is('Н-03: строке присвоен класс уровня toc-h4',
    lis.length === 2 && lis[0].classList.contains('toc-h4'));
  is('Н-03: строка без префикса — без класса toc-hN',
    lis.length === 2 && lis[1].className.indexOf('toc-h') === -1,
    lis.length > 1 ? lis[1].className : null);
}
{
  const lines = fs.readFileSync(path.join(root, 'data/etalon/etalon-sint.md'), 'utf8').split('\n');
  const tocStart = lines.findIndex(l => l.trim().startsWith('{{toc'));
  const end = lines.findIndex((l, i) => i > tocStart && l.trim() === '}}');
  const frag = lines.slice(tocStart, end + 1).join('\n');
  const wrap = new Element('div');
  renderLoop(frag, wrap);
  const nav = wrap.querySelector('.block-toc');
  const lis = nav ? nav.querySelectorAll('li') : [];
  is('Н-03: все строки ручного TOC эталона без «####»',
    lis.length > 0 && lis.every(li => !li.textContent.includes('####')),
    lis.length ? lis[0].textContent : 'нет строк');
}

/* ---------- 4. rev040-Н04 + pr040-З2/М1: демо справки ---------- */
{
  const demo = DG.help.demoSrc();
  const wrap = new Element('div');
  renderLoop(demo, wrap);
  const navAuto = wrap.querySelector('.block-toc--auto');
  const rows = navAuto ? navAuto.querySelectorAll('.toc-row') : [];
  is('Н-04: демо справки — авто-TOC показывает записи (пара h3 верхнего уровня)',
    rows.length >= 2, { rows: rows.length });
  is('Н-04: демо справки — нет плашки «не нашлось»',
    wrap.querySelectorAll('.toc-empty').length === 0);
  is('Н-04: абзац «Этот абзац живёт…» виден (тело column-count)',
    wrap.textContent.includes('Этот абзац живёт на одноколоночной странице'));
  const paras = wrap.querySelectorAll('p').map(p => norm(p.textContent));
  is('Н-04: нет оборванного абзаца «…заголовки 3-го»',
    !paras.some(t => /заголовки 3-го$/.test(t)), paras.filter(t => /заголовки 3-го/.test(t)));
  is('З2: демо не обещает «всё, что вы видите справа» (честный состав страницы)',
    !demo.includes('всё, что вы видите справа'));
  is('Н-04: Ctrl+S описан честно (нет «в браузер и скачать файл»)',
    !demo.includes('в браузер и скачать файл'));
  is('М1: демо — «Добавить блок», а не «Вставить»',
    demo.includes('«Добавить блок»') && !demo.includes('«Вставить»'));
  is('Н-04: демо справки рендерится без пустых страниц',
    pageTexts(wrap).every(p => p.text));
}

/* ---------- 5. rev040-Н05: сходимость нескольких авто-TOC ---------- */
{
  const src = '# Часть\n\n{{toc,auto:1}}\n\n## Раздел\n\n### Глава A\n\nтекст\n\n### Глава B\n\n{{toc,auto:3}}\n\n### Глава C\n\nконец';
  const wrap = new Element('div');
  const r = renderLoop(src, wrap);
  is('Н-05: два {{toc,auto}} с РАЗНЫМИ диапазонами сходятся (без ложного предупреждения)',
    r.stable && r.pass <= 2, { pass: r.pass, stable: r.stable });
  eq('Н-05: построены оба авто-оглавления', wrap.querySelectorAll('.block-toc--auto').length, 2);
}
{
  const src = '# Часть\n\n{{toc,auto:1}}\n\n## Раздел\n\n### Глава A\n\nтекст\n\n### Глава B\n\n{{toc,auto:1}}\n\n### Глава C\n\nконец';
  const wrap = new Element('div');
  const r = renderLoop(src, wrap);
  is('Н-05 регресс: одинаковые диапазоны сходятся за 2 прохода',
    r.pass === 2 && r.stable, { pass: r.pass, stable: r.stable });
}

/* ---------- 6. rev040-Н06: некорректный диапазон — честная плашка ---------- */
{
  is('Н-06: parseSpec(toc,auto:10) — auto:true + badRange',
    DG.toc.parseSpec('toc,auto:10').auto === true &&
    DG.toc.parseSpec('toc,auto:10').badRange === true, DG.toc.parseSpec('toc,auto:10'));
  is('Н-06: parseSpec(toc,auto:2-) — badRange', DG.toc.parseSpec('toc,auto:2-').badRange === true);
  is('Н-06: parseSpec(toc,auto:x) — badRange', DG.toc.parseSpec('toc,auto:x').badRange === true);
  eq('Н-06 регресс: parseSpec(toc,auto) — дефолт 3-3',
    DG.toc.parseSpec('toc,auto'), { auto: true, from: 3, to: 3, badRange: false });
  eq('Н-06 регресс: auto:0 clamp в 1 (Ф-03)',
    DG.toc.parseSpec('toc,auto:0'), { auto: true, from: 1, to: 1, badRange: false });
  eq('Н-06 регресс: auto:9 clamp в 6 (Ф-03)',
    DG.toc.parseSpec('toc,auto:9'), { auto: true, from: 6, to: 6, badRange: false });
  eq('Н-06 регресс: ручной toc,wide не тронут',
    DG.toc.parseSpec('toc,wide'), { auto: false, from: 3, to: 3, badRange: false });
  const wrap = new Element('div');
  renderLoop('{{toc,auto:10}}\n\n# Заг', wrap);
  const plates = wrap.querySelectorAll('.toc-empty');
  is('Н-06: {{toc,auto:10}} — плашка «некорректный диапазон», а не молчаливый пустой nav',
    wrap.querySelectorAll('.block-toc').length === 1 && plates.length === 1 &&
    /некорректный диапазон/.test(plates[0].textContent),
    plates.length ? plates[0].textContent : 'плашки нет');
}

/* ---------- 7. rev040-Н05 (продолжение): {{pageNumber,auto}} — не оглавление ---------- */
{
  const wrap = new Element('div');
  const r = renderLoop('# Заг\n\n{{pageNumber,auto}}\n\nтекст главы', wrap);
  is('Н-05: {{pageNumber,auto}} не принимается за спецификацию авто-TOC (сходимость сразу)',
    r.pass === 1 && r.stable, { pass: r.pass, stable: r.stable });
}

/* ---------- 8. rev040-Н07: версия в DG.config ---------- */
is('Н-07: DG.config.siteVersion определена и равна SITE_VERSION',
  DG.config.siteVersion === '0.4.1-draft' &&
  DG.config.siteVersion === vm.runInThisContext('SITE_VERSION'),
  { config: DG.config.siteVersion });

/* ---------- 9. rev040-Н08 + М1: демо первого запуска ---------- */
{
  const demo = DG.storage.demoMd();
  is('Н-08: демо первого запуска упоминает {{toc,auto}}', demo.includes('{{toc,auto'));
  is('Н-08/М1: демо упоминает кнопку «Добавить блок»', demo.includes('«Добавить блок»'));
  is('Н-08: в демо нет устаревшего «Что уже работает (v0.1.0)»', !demo.includes('(v0.1.0)'));
  is('Н-08/В-12: в демо нет «до трёх уровней»', !demo.includes('до трёх уровней'));
  is('Н-08: в демо нет обещания заглушек «приедет в волне v0.2.0»',
    !demo.includes('приедет в волне v0.2.0'));
  const wrap = new Element('div');
  renderLoop(demo, wrap);
  is('Н-08: демо рендерится без пустых страниц', pageTexts(wrap).every(p => p.text));
}

/* ---------- 10. rev040-Н09 + ответ В-3: safeUrl / ссылки ---------- */
{
  is('Н-09: safeUrl отклоняет protocol-relative //evil.com/x',
    DG.util.safeUrl('//evil.com/x') === null, DG.util.safeUrl('//evil.com/x'));
  is('В-3: safeUrl разрешает mailto (whitelist)',
    DG.util.safeUrl('mailto:mail@example.com') === 'mailto:mail@example.com');
  is('В-3: mailto регистронезависим', DG.util.safeUrl('MAILTO:a@b.c') === 'MAILTO:a@b.c');
  is('Н-09 регресс: javascript: отклоняется', DG.util.safeUrl('javascript:alert(1)') === null);
  is('Н-09 регресс: data: отклоняется', DG.util.safeUrl('data:text/html,x') === null);
  is('Н-09 регресс: относительные и якоря разрешены',
    DG.util.safeUrl('/a.png') === '/a.png' && DG.util.safeUrl('#p2') === '#p2');
  const wrap = new Element('div');
  renderLoop('[почта](mailto:mail@example.com) и [x](//evil.com/y)', wrap);
  const links = wrap.querySelectorAll('a');
  is('В-3: [почта](mailto:…) — кликабельная ссылка с href',
    links.some(a => String(a.getAttribute('href') || '').startsWith('mailto:')));
  is('Н-09: //evil.com — отклонена (.badlink, без href)',
    wrap.querySelectorAll('.badlink').length === 1 &&
    !links.some(a => String(a.getAttribute('href') || '').startsWith('//')));
  const wrap2 = new Element('div');
  renderLoop('Письмо: <mailto:a@b.c>', wrap2);
  is('В-3: autolink <mailto:…> согласован с whitelist — рендерится ссылкой',
    wrap2.querySelectorAll('a').length === 1);
}

/* ---------- 11. rev040-Н10: внутрисловный `_` — литерал (GFM) ---------- */
{
  const nodes = DG.parser.parseInline('значение_курсив_значение и snake_case_var');
  is('Н-10: внутрисловный `_` — литерал (нет узлов курсива/жирного)',
    !hasType(nodes, 'i') && !hasType(nodes, 'b'), nodes);
  is('Н-10 регресс: _курсив_ на границе слова — курсив',
    hasType(DG.parser.parseInline('_курсив_'), 'i'));
  is('Н-10 регресс: __жирный__ — жирный',
    hasType(DG.parser.parseInline('__жирный__'), 'b'));
  is('Н-10: пунктуация перед `_` — граница (GFM)',
    hasType(DG.parser.parseInline('(_в скобках_)'), 'i'));
  is('Н-10 регресс: *звёздочки* границ не требуют',
    hasType(DG.parser.parseInline('слово*курсив*слово'), 'i'));
}

/* ---------- 12. rev040-В12: списки произвольной глубины ---------- */
{
  const ast = DG.parser.parse('- L1\n  - L2\n    - L3\n      - L4\n        - L5');
  let depth = 0;
  (function d(list, k) {
    depth = Math.max(depth, k);
    list.items.forEach(it => { if (it.sub) d(it.sub, k + 1); });
  })(ast.blocks.find(b => b.t === 'list'), 1);
  const wrap = new Element('div');
  DG.render.blocksToItems(ast.blocks).forEach(el => { if (el.tagName) wrap.appendChild(el); });
  let domDepth = 0;
  (function dd(node, k) {
    if (node.tagName === 'UL' || node.tagName === 'OL') domDepth = Math.max(domDepth, k);
    node.childNodes.forEach(c => {
      if (c.nodeType === 1) dd(c, (c.tagName === 'UL' || c.tagName === 'OL') ? k + 1 : k);
    });
  })(wrap, 0);
  is('В-12: 5 уровней списка парсятся и рендерятся (документы приведены к коду)',
    depth === 5 && domDepth === 5, { astDepth: depth, domDepth });
}

/* ---------- 13. эталон: сохранность абзацев и пустые страницы ---------- */
{
  const src = fs.readFileSync(path.join(root, 'data/etalon/etalon-sint.md'), 'utf8');
  const doc = DG.parser.parse(src);
  const paras = [];
  (function walk(blocks) {
    (blocks || []).forEach(b => {
      if (b.t === 'para') {
        /* абзацы с инлайн-картинками пропускаются: изображение рендерится
           плейсхолдером (до v1.0.0 — fp №18), его текст дословно не входит
           в разворот — проверяется сохранность ТЕКСТОВЫХ абзацев (Н-01) */
        if (hasType(b.in, 'img')) return;
        const t = norm(DG.toc.textOf(b.in));
        if (t.length >= 20) paras.push(t);
      } else if (b.t === 'v3') walk(b.body);
      else if (b.t === 'list') (b.items || []).forEach(it => { if (it.sub) walk([it.sub]); });
    });
  })(doc.blocks);
  const wrap = new Element('div');
  DG.pages.docTitle = 'Синтетический эталон';
  DG.toc.reset(DG.toc.collectHeadings(doc.blocks));
  const t0 = Date.now();
  let res = null, pass = 0, stable = false;
  while (pass < 3 && !stable) {
    res = DG.pages.paginate(DG.render.blocksToItems(doc.blocks), wrap);
    stable = DG.toc.collect(doc.blocks, wrap);
    pass++;
  }
  const ms = Date.now() - t0;
  const hay = norm(wrap.textContent);
  const missing = paras.filter(t => !hay.includes(t));
  is('Н-01: каждый абзац AST эталона (включая тела 17 {{column-count}}) присутствует в развороте',
    missing.length === 0,
    { абзацев: paras.length, потеряно: missing.length, примеры: missing.slice(0, 3) });
  is('Н-02: эталон рендерится без пустых страниц',
    pageTexts(wrap).every(p => p.text));
  console.log('  INFO эталон: страниц ' + res.pages + ', проходов ' + pass +
    ', сходимость ' + stable + ', абзацев проверено ' + paras.length +
    ', время ' + ms + ' мс (Node, DOM-заглушка без layout)');
}

console.log('='.repeat(56));
console.log(`ИТОГ: ${passes} OK, ${fails} FAIL → ${fails ? 'КРАСНЫЙ' : 'ЗЕЛЁНЫЙ'}`);
process.exit(fails ? 1 : 0);
