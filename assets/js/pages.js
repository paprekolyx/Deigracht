/* Deigracht — пагинация (pages.js), волна v0.2.0 (fp №2 ч.2 + DoD волны 2).
   Принцип: страницы — контейнеры фиксированной геометрии (Letter/A4 —
   ADR-003 ред. 1.1) с колонками (column-fill: auto); содержимое
   раскладывается жадно с измерением переполнения (scrollWidth >
   clientWidth = появились лишние колонки). `\page` — принудительный разрыв.

   Новое в v0.2.0:
   - директива {{column-count:N}} (block-colcount): закрывает текущую
     страницу и открывает новую с N колонками (семантика расхождения с
     Homebrewery зафиксирована: otchet §1.4 — у нас колонки применяются
     со следующей страницы, а не к текущей);
   - **дробление oversized-блоков** (DoD волны 2): блок, не влезающий в
     пустую страницу, разрезается по атомарным единицам (слова абзаца,
     li списка, tr таблицы с повтором шапки, дочерние элементы контейнера)
     бинарным поиском по измерению; неразрезаемое (h1–h6, hr, плейсхолдеры)
     — прежняя честная отметка переполнения.

   Новое в v0.4.1 (rev040, решения владельца):
   - Н-01: тело {{column-count:N …}} (дочерние элементы директивы)
     выкладывается первыми items на N-колоночной странице — текст больше
     не теряется;
   - Н-02: пустая текущая страница принимает колонки директивы без закрытия
     (прежняя логика оставляла пустую страницу — класс дефекта pr030-З1);
   - ВЛ-15 (ответ В-1 — гибрид): таблица выше колонки получает по замеру
     класс table-wrap--split — CSS дробит её по строкам с повтором шапки
     (thead: table-header-group, tr: break-inside avoid); короткая идёт
     целиком (break-inside: avoid). Замер — только в браузере: в DOM-заглушке
     (tests/dom-stub.js) layout отсутствует, clientHeight = 0 — разметка
     классом пропускается. */
'use strict';

DG.pages = (function () {

  var DEFAULT_COLS = 2;

  function makePage(cols) {
    var page = DG.util.el('div', 'page');
    if (cols && cols !== DEFAULT_COLS) page.classList.add('page--cols-' + cols);
    page.setAttribute('data-cols', String(cols || DEFAULT_COLS));
    var body = DG.util.el('div', 'page-body');
    var foot = DG.util.el('div', 'page-foot');
    page.appendChild(body);
    page.appendChild(foot);
    return { page: page, body: body, foot: foot, cols: cols || DEFAULT_COLS };
  }

  function overflows(body) {
    return body.scrollWidth > body.clientWidth + 2;
  }
  function hasContent(body) {
    return body.childElementCount > 0;
  }

  /* rev040-Н02: применение N колонок к текущей (пустой) странице —
     без закрытия: класс page--cols-N и data-cols, как в makePage */
  function setPageCols(p, cols) {
    p.cols = cols;
    p.page.setAttribute('data-cols', String(cols));
    for (var k = 1; k <= 4; k++) p.page.classList.remove('page--cols-' + k);
    if (cols !== DEFAULT_COLS) p.page.classList.add('page--cols-' + cols);
  }

  /* ВЛ-15 (ответ В-1 — гибрид): таблица выше колонки — класс
     table-wrap--split (CSS: break-inside auto, tr не режется, thead
     повторяется на фрагментах); помещается в колонку — класс снимается
     (таблица идёт целиком, break-inside: avoid). Замер браузерный:
     в DOM-заглушке clientHeight = 0 — разметка пропускается. */
  function markLongTables(body) {
    var colH = body.clientHeight;
    if (!colH) return;
    var wraps = body.querySelectorAll('.table-wrap');
    for (var w = 0; w < wraps.length; w++) {
      var t = wraps[w];
      if (typeof t.getBoundingClientRect !== 'function') continue;
      var h = t.getBoundingClientRect().height;
      if (h > colH + 2) t.classList.add('table-wrap--split');
      else t.classList.remove('table-wrap--split');
    }
  }

  /* ---------- дробление oversized-блоков ---------- */

  /* Атомарные единицы элемента + фабрики частей */
  function getUnits(el) {
    var tag = el.tagName;

    if (tag === 'P' || tag === 'BLOCKQUOTE') {
      var units = [];
      for (var c = 0; c < el.childNodes.length; c++) {
        var ch = el.childNodes[c];
        if (ch.nodeType === 3) {
          var words = String(ch.textContent).split(/(\s+)/);
          for (var w = 0; w < words.length; w++) {
            if (words[w]) units.push({ type: 'text', v: words[w] });
          }
        } else if (ch.nodeType === 1) {
          units.push({ type: 'node', v: ch });
        }
      }
      return {
        n: units.length,
        build: function (from, to) {
          var p = el.cloneNode(false);
          for (var i = from; i < to; i++) {
            p.appendChild(units[i].type === 'text'
              ? document.createTextNode(units[i].v)
              : units[i].v.cloneNode(true));
          }
          return p;
        }
      };
    }

    if (tag === 'UL' || tag === 'OL') {
      var lis = Array.prototype.slice.call(el.children);
      return {
        n: lis.length,
        build: function (from, to) {
          var l = el.cloneNode(false);
          for (var i = from; i < to; i++) l.appendChild(lis[i].cloneNode(true));
          return l;
        }
      };
    }

    if (tag === 'DIV' && el.classList.contains('table-wrap')) {
      var table = el.querySelector('table');
      if (!table) return null;
      var head = table.querySelector('thead');
      var rows = table.querySelectorAll('tbody tr');
      rows = Array.prototype.slice.call(rows);
      if (rows.length < 2) return null;
      return {
        n: rows.length,
        build: function (from, to) {
          var wrap = el.cloneNode(false);
          var t = table.cloneNode(false);
          if (head) t.appendChild(head.cloneNode(true));
          var tb = DG.util.el('tbody');
          for (var i = from; i < to; i++) tb.appendChild(rows[i].cloneNode(true));
          t.appendChild(tb);
          wrap.appendChild(t);
          return wrap;
        }
      };
    }

    if (tag === 'DIV' || tag === 'ASIDE' || tag === 'NAV' || tag === 'SECTION') {
      var kids = Array.prototype.slice.call(el.children);
      if (kids.length < 2) return null;
      return {
        n: kids.length,
        build: function (from, to) {
          var d = el.cloneNode(false);
          for (var i = from; i < to; i++) d.appendChild(kids[i].cloneNode(true));
          return d;
        }
      };
    }
    return null; /* h1–h6, hr, плейсхолдеры и пр. — не режутся */
  }

  /* Бинарный поиск наибольшего префикса, влезающего в пустой body */
  function splitToFit(el, body) {
    var u = getUnits(el);
    if (!u || u.n < 2) return null;
    var lo = 1, hi = u.n - 1, best = 0;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      var part = u.build(0, mid);
      body.appendChild(part);
      var ok = !overflows(body);
      body.removeChild(part);
      if (ok) { best = mid; lo = mid + 1; } else { hi = mid - 1; }
    }
    if (best < 1) return null;
    return [u.build(0, best), u.build(best, u.n)];
  }

  /* ---------- основная раскладка ---------- */

  function paginate(items, wrap) {
    wrap.textContent = '';
    var batch = (DG.config && DG.config.paginateBatch) || 8;

    var current = makePage(DEFAULT_COLS);
    wrap.appendChild(current.page);
    var pageCount = 1;
    var overflowBlocks = [];
    var splitCount = 0;

    function closePage(cols) {
      current = makePage(cols);
      wrap.appendChild(current.page);
      pageCount++;
    }

    var i = 0;
    while (i < items.length) {
      var it = items[i];

      if (it && it.marker) {
        if (hasContent(current.body)) closePage(DEFAULT_COLS);
        i++;
        continue;
      }

      /* директива колонок: N колонок — текущей пустой странице (rev040-Н02:
         без пустой страницы-вставки) или новой странице; тело директивы
         (rev040-Н01) — отцепляем и выкладываем следующими items потока */
      if (it.classList && it.classList.contains('block-colcount')) {
        var cols = parseInt(it.getAttribute('data-cols'), 10) || DEFAULT_COLS;
        if (hasContent(current.body)) closePage(cols);
        else if (current.cols !== cols) setPageCols(current, cols);
        var kids = Array.prototype.slice.call(it.children);
        for (var kd = 0; kd < kids.length; kd++) it.removeChild(kids[kd]);
        if (kids.length) items.splice.apply(items, [i + 1, 0].concat(kids));
        i++;
        continue;
      }

      /* жадный батч */
      var added = 0;
      while (i < items.length && added < batch &&
             !(items[i] && items[i].marker) &&
             !(items[i].classList && items[i].classList.contains('block-colcount'))) {
        current.body.appendChild(items[i]);
        i++; added++;
      }

      /* замер длинных таблиц (ВЛ-15) — до отката: дробление меняет
         наполнение колонок и результат измерения переполнения */
      if (added) markLongTables(current.body);

      /* откат до границы переполнения */
      while (added > 0 && overflows(current.body)) {
        current.body.removeChild(current.body.lastElementChild);
        i--; added--;
      }

      if (added === 0) {
        /* одиночный блок больше пустой страницы — пробуем раздробить */
        var parts = splitToFit(items[i], current.body);
        if (parts) {
          splitCount++;
          current.body.appendChild(parts[0]);
          markLongTables(current.body);
          items.splice(i, 1, parts[1]); /* хвост — на следующую страницу */
          closePage(current.cols);
          continue;
        }
        /* неразрезаемое — честная отметка переполнения */
        current.body.appendChild(items[i]);
        i++;
        current.page.classList.add('page--over');
        overflowBlocks.push({
          tag: (items[i - 1].tagName || '?').toLowerCase(),
          page: pageCount
        });
        closePage(current.cols);
        continue;
      }

      /* зонд: влезет ли следующий элемент — если нет, закрываем страницу */
      if (i < items.length && !(items[i] && items[i].marker) &&
          !(items[i].classList && items[i].classList.contains('block-colcount'))) {
        var probe = items[i];
        current.body.appendChild(probe);
        if (overflows(current.body)) {
          current.body.removeChild(probe);
          closePage(current.cols);
        } else {
          current.body.removeChild(probe);
        }
      }
    }

    /* номера страниц и колонтитул */
    var pages = wrap.querySelectorAll('.page');
    for (var p = 0; p < pages.length; p++) {
      pages[p].setAttribute('data-page', String(p + 1));
      var foot = pages[p].querySelector('.page-foot');
      foot.textContent = '';
      foot.appendChild(DG.util.el('span', 'foot-title', { text: DG.pages.docTitle || '' }));
      foot.appendChild(DG.util.el('span', 'foot-num', { text: String(p + 1) }));
      if (pages[p].classList.contains('page--over')) {
        pages[p].appendChild(DG.util.el('div', 'page-over-flag',
          { text: 'Блок крупнее страницы и не поддаётся дроблению — содержимое выходит за границы (см. статус-бар)' }));
      }
    }

    return {
      pages: pageCount,
      overflowBlocks: overflowBlocks,
      splitBlocks: splitCount
    };
  }

  return {
    paginate: paginate,
    docTitle: ''
  };
})();
