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
   Якоря строк — #pN: клик прокручивает к странице N (editor.js, help.js).
   Заголовки, вложенные в V3-блоки (статблоки, врезки), в состав не входят
   и data-hid не получают (render.js) — оглавление не засоряется.
   Чистая логика (parseSpec / textOf / collectHeadings / buildEntries)
   тестируется без DOM в tests/parser-smoke.js (раздел 4); рендер —
   в tests/render-smoke.js (DOM-заглушка).
   Безопасность (SECURITY §2): DOM строится программно (DG.util.el),
   текст заголовков попадает только в textContent; якоря #pN — относительные
   (safeUrl-разрешённые), внешние ссылки из оглавления невозможны.

   v0.4.1 (rev040):
   - Н-05: state.rendered — КАРТА spec-ключ → показанные записи: несколько
     авто-оглавлений с разными диапазонами сравниваются каждое со своим
     слотом — ложная «несходимость» (3 прохода + предупреждение) устранена;
   - Н-06: parseSpec ловит токен `auto` независимо от корректности диапазона:
     однозначные цифры clamp'ятся 1–6 (Ф-03), прочее (`auto:10`, `auto:2-`,
     `auto:x`) — флаг badRange и честная плашка «некорректный диапазон
     уровней» вместо молчаливого пустого ручного nav. */
'use strict';

DG.toc = (function () {

  /* Состояние проходов: headings — состав заголовков текущего документа,
     pageMap — hid → номер страницы с последнего прохода пагинации,
     rendered — карта spec-ключ → записи, фактически показанные в
     оглавлениях на этом проходе (rev040-Н05). */
  var state = { headings: [], pageMap: null, rendered: {}, entries: null };

  function reset(headings) {
    state = {
      headings: headings || [],
      pageMap: null, rendered: {}, entries: null
    };
  }

  /* ---------- разбор модификаторов: toc,auto / toc,auto:2-4 ---------- */

  /* rev040-Н06: токен `auto` ловится независимо от корректности диапазона.
     Корректны только однозначные цифры (0 и 9 clamp'ятся в 1–6 — Ф-03);
     `auto:10`, `auto:2-`, `auto:x` — auto: true + badRange: честная плашка
     вместо молчаливого пустого оглавления. */
  function parseSpec(modsRaw) {
    var toks = String(modsRaw || '').split(/[,;]/);
    var spec = { auto: false, from: 3, to: 3, badRange: false };
    for (var i = 0; i < toks.length; i++) {
      var tok = toks[i].trim();
      var m = /^auto(?::\s*(\d)(?:\s*-\s*(\d))?)?$/.exec(tok);
      if (m) {
        spec.auto = true;
        if (m[1]) {
          spec.from = parseInt(m[1], 10);
          spec.to = m[2] ? parseInt(m[2], 10) : spec.from;
        }
      } else if (/^auto\b/.test(tok)) {
        spec.auto = true;
        spec.badRange = true;
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

  /* Ключ слота сходимости: оглавления с одинаковым диапазоном сравниваются
     с одним слотом (rev040-Н05). */
  function specKey(spec) { return spec.from + '-' + spec.to; }

  /* Первый авто-узел документа: карта страниц общая для всех оглавлений.
     v0.4.1: учитываются только блоки {{toc…}} — токен `auto` в других
     модификаторах ({{pageNumber,auto}}) авто-оглавлением не является
     (иначе — ложная несходимость проходов, класс rev040-Н05). */
  function firstModOf(modsRaw) {
    return String(modsRaw || '').split(/[,;]/)[0].split(/[:]/)[0].trim().toLowerCase();
  }
  function findSpec(blocks) {
    var found = null;
    (blocks || []).forEach(function (b) {
      if (found) return;
      if (b.t === 'v3' && firstModOf(b.modsRaw) === 'toc' &&
          parseSpec(b.modsRaw).auto) found = parseSpec(b.modsRaw);
    });
    return found;
  }

  /* Все авто-спецификации документа (rev040-Н05): уникальные по ключу,
     в порядке появления; только блоки {{toc…}}; badRange не участвует —
     его плашка статична. */
  function findAllSpecs(blocks) {
    var seen = {}, out = [];
    (blocks || []).forEach(function (b) {
      if (b.t !== 'v3') return;
      if (firstModOf(b.modsRaw) !== 'toc') return;
      var sp = parseSpec(b.modsRaw);
      if (!sp.auto || sp.badRange) return;
      var k = specKey(sp);
      if (seen[k]) return;
      seen[k] = true;
      out.push(sp);
    });
    return out;
  }

  /* ---------- чистая логика состава ---------- */

  /* Плоский текст инлайнов заголовка (жирный/курсив/код — без разметки).
     v0.4.1 (сопутствующая правка, найдено render-smoke при проверке Н-01):
     схлопывание пробелов и trim — только верхнего уровня; вложенные инлайны
     сохраняют краевые пробелы (прежде «Глава ** а **» теряла пробелы
     вложенного содержимого — метка оглавления могла склеивать слова). */
  function flatOf(inl) {
    var out = '';
    (inl || []).forEach(function (n) {
      if (n.t === 'text' || n.t === 'code') out += n.v;
      else if (n.t === 'img') out += (n.alt || '');
      else if (n.in) out += flatOf(n.in);
    });
    return out;
  }
  function textOf(inl) {
    return flatOf(inl).replace(/\s+/g, ' ').trim();
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
    if (spec && spec.badRange) {
      /* rev040-Н06: некорректный диапазон — честная плашка, а не молчаливый
         пустой nav; в сходимости проходов такое оглавление не участвует */
      ul.appendChild(DG.util.el('li', 'toc-empty toc-invalid', {
        text: 'Оглавление: некорректный диапазон уровней в {{toc,auto:…}} — '
          + 'верно: {{toc,auto}}, {{toc,auto:N}} или {{toc,auto:N-M}} '
          + '(уровни 1–6)'
      }));
      nav.appendChild(ul);
      return nav;
    }
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
    state.rendered[specKey(spec)] = (entries || []).map(function (e) {
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

  /* После пагинации: пересчитать карту и состав; вернуть true, если ВСЕ
     авто-оглавления на этом проходе уже показывали эти же номера
     (устойчивость). rev040-Н05: сравнение — по слоту каждой спецификации,
     а не по первому оглавлению: разные диапазоны больше не дают ложной
     несходимости. */
  function collect(blocks, pagesRoot) {
    var specs = findAllSpecs(blocks);
    if (!specs.length) {
      state.pageMap = [];
      state.entries = [];
      return true;
    }
    var pm = pagesFromDom(pagesRoot);
    var hs = collectHeadings(blocks);
    var same = true;
    for (var i = 0; i < specs.length; i++) {
      var entries = buildEntries(hs, pm, specs[i]);
      var prev = state.rendered[specKey(specs[i])];
      if (JSON.stringify(entries) !==
          JSON.stringify(prev === undefined ? null : prev)) same = false;
      if (i === 0) state.entries = entries;
    }
    state.pageMap = pm;
    return same;
  }

  function entries() { return state.entries || []; }

  return {
    reset: reset,
    parseSpec: parseSpec,
    specKey: specKey,
    findSpec: findSpec,
    findAllSpecs: findAllSpecs,
    textOf: textOf,
    flatOf: flatOf,
    collectHeadings: collectHeadings,
    pagesFromDom: pagesFromDom,
    buildEntries: buildEntries,
    buildNav: buildNav,
    autoNav: autoNav,
    collect: collect,
    entries: entries
  };
})();
