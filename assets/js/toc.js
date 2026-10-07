/* Deigracht — автооглавление (toc.js), волна v0.4.0 (fp №11, приоритет №2).
   {{toc,auto}} и {{toc,auto:N-M}} собираются из заголовков документа с
   реальными номерами страниц. Двухпроходный рендер (editor.js / help.js):
   проход 1 — пагинация с заглушками «…» вместо номеров, проход 2 — номера
   из карты страниц; если карта после повторной пагинации изменилась —
   до 3 проходов до устойчивости.
   Состав по умолчанию — заголовки 3-го уровня: главы книги владельца
   (его ручное оглавление на 82 записи = h3-состав, метрики эталона
   заморожены: h1/h2/h3 = 2/26/82; DoD волны 4 — авто-состав эталона
   совпадает с ручным TOC по составу). Диапазон уровней перекрывается
   N-M: {{toc,auto:1-3}} — части, разделы и главы с отступами по уровням,
   {{toc,auto:2}} — только разделы.
   Якоря строк — #pN: клик прокручивает к странице N (editor.js).
   Заголовки, вложенные в V3-блоки (статблоки, врезки), в состав не входят
   и data-hid не получают (render.js) — оглавление не засоряется.
   Чистая логика (parseSpec / textOf / collectHeadings / buildEntries)
   тестируется без DOM в tests/parser-smoke.js (раздел 4).
   Безопасность (SECURITY §2): DOM строится программно (DG.util.el),
   текст заголовков попадает только в textContent; якоря #pN — относительные
   (safeUrl-разрешённые), внешние ссылки из оглавления невозможны. */
'use strict';

DG.toc = (function () {

  /* Состояние проходов: headings — состав заголовков текущего документа,
     pageMap — hid → номер страницы с последнего прохода пагинации,
     rendered — что фактически показано в оглавлении на этом проходе. */
  var state = { headings: [], pageMap: null, rendered: null, entries: null };

  function reset(headings) {
    state = {
      headings: headings || [],
      pageMap: null, rendered: null, entries: null
    };
  }

  /* ---------- разбор модификаторов: toc,auto / toc,auto:2-4 ---------- */

  function parseSpec(modsRaw) {
    var toks = String(modsRaw || '').split(/[,;]/);
    var spec = { auto: false, from: 3, to: 3 };
    for (var i = 0; i < toks.length; i++) {
      var m = /^auto(?::\s*(\d)(?:\s*-\s*(\d))?)?$/.exec(toks[i].trim());
      if (m) {
        spec.auto = true;
        if (m[1]) {
          spec.from = parseInt(m[1], 10);
          spec.to = m[2] ? parseInt(m[2], 10) : spec.from;
        }
      }
    }
    if (spec.from > spec.to) {
      var t = spec.from; spec.from = spec.to; spec.to = t;
    }
    /* clamp: уровней заголовков всего шесть (находка ревью R1-03) */
    spec.from = Math.max(1, Math.min(6, spec.from));
    spec.to = Math.max(1, Math.min(6, spec.to));
    if (spec.from > spec.to) spec.to = spec.from;
    return spec;
  }

  /* Первый авто-узел документа: спецификация одна на документ —
     оглавлений-авто может быть несколько, карта страниц общая. */
  function findSpec(blocks) {
    var found = null;
    (blocks || []).forEach(function (b) {
      if (found) return;
      if (b.t === 'v3' && parseSpec(b.modsRaw).auto) found = parseSpec(b.modsRaw);
    });
    return found;
  }

  /* ---------- чистая логика состава ---------- */

  /* Плоский текст инлайнов заголовка (жирный/курсив/код — без разметки). */
  function textOf(inl) {
    var out = '';
    (inl || []).forEach(function (n) {
      if (n.t === 'text' || n.t === 'code') out += n.v;
      else if (n.t === 'img') out += (n.alt || '');
      else if (n.in) out += textOf(n.in);
    });
    return out.replace(/\s+/g, ' ').trim();
  }

  /* Заголовки верхнего уровня в порядке рендера. */
  function collectHeadings(blocks) {
    var hs = [];
    (blocks || []).forEach(function (b) {
      if (b.t === 'heading') hs.push({ lvl: b.lvl, text: textOf(b.in) });
    });
    return hs;
  }

  /* Карта страниц из DOM разворота: data-hid проставлен render.js только
     заголовкам верхнего уровня; страницы — порядком .page[data-page]. */
  function pagesFromDom(pagesRoot) {
    var map = [];
    var pages = pagesRoot.querySelectorAll('.page');
    for (var p = 0; p < pages.length; p++) {
      var hs = pages[p].querySelectorAll('[data-hid]');
      for (var h = 0; h < hs.length; h++) {
        map[parseInt(hs[h].getAttribute('data-hid'), 10)] = p + 1;
      }
    }
    return map;
  }

  function buildEntries(headings, pageMap, spec) {
    var out = [];
    for (var i = 0; i < (headings || []).length; i++) {
      var h = headings[i];
      if (h.lvl < spec.from || h.lvl > spec.to) continue;
      out.push({
        lvl: h.lvl, text: h.text, hid: i,
        page: (pageMap && pageMap[i]) || null
      });
    }
    return out;
  }

  /* ---------- DOM оглавления ---------- */

  /* Те же классы точечных лидеров, что у ручного {{toc}} (theme-book.css);
     отступы уровней — .block-toc--auto .toc-lvl-N. */
  function buildNav(entries, spec) {
    var nav = DG.util.el('nav', 'block-toc block-toc--auto');
    var ul = DG.util.el('ul');
    if (!(entries && entries.length)) {
      /* заголовков выбранного диапазона нет — честная плашка, а не
         пустой блок (находка ревью R1-02) */
      var rng = spec ? (spec.from + (spec.to !== spec.from ? '–' + spec.to : '')) : 'N';
      ul.appendChild(DG.util.el('li', 'toc-empty', {
        text: 'Оглавление: заголовков уровня ' + rng + ' не нашлось — '
          + 'уточните диапазон ({{toc,auto:N-M}})'
      }));
    }
    (entries || []).forEach(function (en) {
      var li = DG.util.el('li', 'toc-lvl-' + en.lvl);
      var a = DG.util.el('a', 'toc-row');
      if (en.page) {
        a.setAttribute('href', '#p' + en.page);
      } else {
        /* номер ещё не известен (первый проход): честная заглушка */
        a.setAttribute('aria-disabled', 'true');
      }
      a.appendChild(DG.util.el('span', 'toc-title', { text: en.text }));
      a.appendChild(DG.util.el('span', 'toc-dots'));
      a.appendChild(DG.util.el('span', 'toc-page',
        { text: en.page ? String(en.page) : '…' }));
      li.appendChild(a);
      ul.appendChild(li);
    });
    nav.appendChild(ul);
    state.rendered = (entries || []).map(function (e) {
      return { lvl: e.lvl, text: e.text, hid: e.hid, page: e.page };
    });
    return nav;
  }

  /* Оглавление для прохода рендера: состав известен сразу (заголовки из
     AST), номера — из карты прошлого прохода (на первом проходе её нет). */
  function autoNav(spec) {
    return buildNav(buildEntries(state.headings, state.pageMap, spec), spec);
  }

  /* ---------- сходимость проходов (editor.js / help.js) ---------- */

  /* После пагинации: пересчитать карту и состав; вернуть true, если
     оглавление на этом проходе уже показывало эти же номера (устойчивость). */
  function collect(blocks, pagesRoot) {
    var spec = findSpec(blocks);
    if (!spec) {
      state.pageMap = [];
      state.entries = [];
      return true;
    }
    var pm = pagesFromDom(pagesRoot);
    var entries = buildEntries(collectHeadings(blocks), pm, spec);
    var same = JSON.stringify(entries) === JSON.stringify(state.rendered);
    state.pageMap = pm;
    state.entries = entries;
    return same;
  }

  function entries() { return state.entries || []; }

  return {
    reset: reset,
    parseSpec: parseSpec,
    findSpec: findSpec,
    textOf: textOf,
    collectHeadings: collectHeadings,
    pagesFromDom: pagesFromDom,
    buildEntries: buildEntries,
    buildNav: buildNav,
    autoNav: autoNav,
    collect: collect,
    entries: entries
  };
})();
