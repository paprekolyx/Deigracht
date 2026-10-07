/* Deigracht — пагинация (pages.js), волна v0.1.0 (прототип АН-07).
   Принцип: страницы — контейнеры фиксированной геометрии (Letter/A4 —
   ADR-003 ред. 1.1) с двумя колонками (column-fill: auto); содержимое
   раскладывается жадно с измерением переполнения (scrollWidth >
   clientWidth = появились лишние колонки). \page — принудительный разрыв.

   Ограничение v0.1.0 (техпаспорт §10, честная граница): блок крупнее
   страницы не разрезается — помещается на отдельную страницу с меткой
   «переполнение» и предупреждением в статус-баре; дробление абзацев/таблиц
   по строкам — уточнение волны v0.2.0 вместе с блоками V3. */
'use strict';

DG.pages = (function () {

  function makePage() {
    var page = DG.util.el('div', 'page');
    var body = DG.util.el('div', 'page-body');
    var foot = DG.util.el('div', 'page-foot');
    page.appendChild(body);
    page.appendChild(foot);
    return { page: page, body: body, foot: foot };
  }

  function overflows(body) {
    return body.scrollWidth > body.clientWidth + 2;
  }

  function pageHasContent(body) {
    return body.childElementCount > 0;
  }

  /* items — массив (Element | {marker:true}) из render.blocksToItems.
     wrap — живой контейнер #pages (измерения требуют присутствия в DOM).
     Возвращает {pages: n, overflowBlocks: [...], unclosed: bool?}. */
  function paginate(items, wrap) {
    wrap.textContent = '';
    var batch = (DG.config && DG.config.paginateBatch) || 8;

    var current = makePage();
    wrap.appendChild(current.page);
    var pageCount = 1;
    var overflowBlocks = [];

    function closePage() {
      current = makePage();
      wrap.appendChild(current.page);
      pageCount++;
    }

    var i = 0;
    while (i < items.length) {
      var it = items[i];

      if (it && it.marker) {
        if (pageHasContent(current.body)) closePage();
        i++;
        continue;
      }

      /* жадный батч */
      var added = 0;
      while (i < items.length && added < batch && !(items[i] && items[i].marker)) {
        current.body.appendChild(items[i]);
        i++; added++;
      }

      /* откат до границы переполнения */
      while (added > 0 && overflows(current.body)) {
        current.body.removeChild(current.body.lastElementChild);
        i--; added--;
      }

      if (added === 0) {
        /* одиночный блок больше страницы — честное переполнение */
        current.body.appendChild(items[i]);
        i++;
        current.page.classList.add('page--over');
        overflowBlocks.push({
          tag: (items[i - 1].tagName || '?').toLowerCase(),
          page: pageCount
        });
        closePage();
        continue;
      }

      /* если после отката блок не влез — следующая страница;
         если батч добавлен целиком и место ещё есть — продолжаем ту же */
      if (i < items.length && !(items[i] && items[i].marker)) {
        var probe = items[i];
        current.body.appendChild(probe);
        if (overflows(current.body)) {
          current.body.removeChild(probe);
          closePage();
        } else {
          current.body.removeChild(probe);
          /* место есть — продолжим батчами на этой же странице */
        }
      }
    }

    /* номера страниц и колонтитул */
    var feet = wrap.querySelectorAll('.page');
    for (var p = 0; p < feet.length; p++) {
      var foot = feet[p].querySelector('.page-foot');
      foot.textContent = '';
      var left = DG.util.el('span', 'foot-title', { text: DG.pages.docTitle || '' });
      var right = DG.util.el('span', 'foot-num', { text: String(p + 1) });
      foot.appendChild(left);
      foot.appendChild(right);
      if (feet[p].classList.contains('page--over')) {
        feet[p].appendChild(DG.util.el('div', 'page-over-flag',
          { text: 'Блок крупнее страницы — содержимое выходит за границы (см. статус-бар)' }));
      }
    }

    /* пустой документ — одна пустая страница уже есть */
    return { pages: pageCount, overflowBlocks: overflowBlocks };
  }

  return {
    paginate: paginate,
    docTitle: ''
  };
})();
