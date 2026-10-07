/* Deigracht — блоки Homebrewery V3 (blocks.js), волна v0.2.0 (fp №2 ч.2).
   Полное оформление блоков: wide / note / descriptive / monster (+___-
   статблоки) / toc (ручной, с точечными лидерами и номерами страниц) /
   column-count (директива колонок для страницы — pages.js) / pageNumber
   (скрытый маркер: нумерация живёт в колонтитуле .page-foot).
   {{imageMask*}} — плейсхолдер до v1.0.0 (fp №18, решение владельца).
   Неизвестный модификатор — видимая плашка (честное правило совместимости,
   otchet §1.4), а не молчаливая поломка.
   Безопасность: DOM строится программно (render.js), innerHTML не используется.

   v0.4.1 (rev040):
   - Н-01: тело `{{column-count:N …}}` рендерится дочерними элементами
     директивы — pages.js выкладывает их первыми на N-колоночной странице
     (до этого содержимое блока молча терялось: сниппет, демо справки,
     17 блоков эталона);
   - Н-03: строки ручного TOC теряют литеральный префикс `####` — паттерн
     эталона и документа владельца `- #### [{{…}}{{N}}](#pN)` (в Homebrewery
     `####` внутри элемента списка — заголовочное оформление строки);
     tocHeading() — чистая функция (тестируется без DOM в parser-smoke),
     строка получает класс уровня toc-hN (оформление — theme-book.css);
   - чистка: неиспользуемая таблица KNOWN удалена (мелочи rev040 §5). */
'use strict';

DG.blocks = (function () {

  function isImageMask(mod) { return /^imagemask/i.test(mod); }

  function firstMod(modsRaw) {
    return String(modsRaw || '').split(/[,;]/)[0].split(/[:]/)[0].trim().toLowerCase();
  }
  function firstParam(modsRaw) {
    var m = String(modsRaw || '').match(/^[^:,;]+[:]\s*([^,;]+)/);
    return m ? m[1].trim() : '';
  }

  /* ---------- оглавление: {{ X}}{{ N }} в тексте ссылки → титул + лидер + страница ---------- */
  var TOC_LABEL = /\{\{\s*([\s\S]+?)\s*\}\}\s*\{\{\s*(\d+)\s*\}\}/;

  /* rev040-Н03: ATX-префикс в начале строки TOC (`#### `) — уровень
     оформления, а не текст. Чистая функция (без DOM): {lvl, text},
     lvl = 0 — префикса нет. */
  var RE_TOC_HASH = /^(#{1,6})\s+/;
  function tocHeading(text) {
    var s = String(text == null ? '' : text);
    var m = RE_TOC_HASH.exec(s);
    if (!m) return { lvl: 0, text: s };
    return { lvl: m[1].length, text: s.slice(m[0].length) };
  }

  function decorateToc(box) {
    var links = box.querySelectorAll('a');
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      var li = (a.parentNode && a.parentNode.tagName === 'LI') ? a.parentNode : null;
      var lvl = 0;
      /* rev040-Н03: `####` перед ссылкой живёт текстовым узлом строки —
         снять его и запомнить уровень (класс toc-hN на строке) */
      if (li) {
        var sibs = Array.prototype.slice.call(li.childNodes);
        for (var c = 0; c < sibs.length; c++) {
          if (sibs[c].nodeType !== 3) continue;
          var th = tocHeading(sibs[c].textContent);
          if (!th.lvl) continue;
          lvl = th.lvl;
          if (th.text.trim()) sibs[c].textContent = th.text.replace(/^\s+/, '');
          else li.removeChild(sibs[c]);
        }
      }
      var label = a.textContent;
      var th2 = tocHeading(label);
      if (th2.lvl) { label = th2.text; if (!lvl) lvl = th2.lvl; }
      var m = label.match(TOC_LABEL);
      a.className = 'toc-row';
      a.textContent = '';
      var title = DG.util.el('span', 'toc-title', { text: m ? m[1] : label.trim() });
      var dots = DG.util.el('span', 'toc-dots');
      a.appendChild(title);
      a.appendChild(dots);
      if (m) a.appendChild(DG.util.el('span', 'toc-page', { text: m[2] }));
      if (lvl) (li || a).classList.add('toc-h' + lvl);
    }
    return box;
  }

  /* ---------- рендер блока ---------- */

  /* node — AST {t:'v3', modsRaw, closed, body}; renderBlocks(blocks, container)
     из render.js. Возвращает DOM-элемент (или директиву для pages.js). */
  function render(node, renderBlocks) {
    var mod = firstMod(node.modsRaw);
    var inner;

    switch (mod) {
      case 'wide':
        inner = DG.util.el('div', 'block-wide');
        renderBlocks(node.body || [], inner);
        return inner;

      case 'note':
        inner = DG.util.el('aside', 'block-note');
        renderBlocks(node.body || [], inner);
        return inner;

      case 'descriptive':
        inner = DG.util.el('aside', 'block-desc');
        renderBlocks(node.body || [], inner);
        return inner;

      case 'monster':
        inner = DG.util.el('div', 'block-monster');
        renderBlocks(node.body || [], inner);
        return inner;

      case 'toc': {
        /* волна v0.4.0 (fp №11): {{toc,auto}} / {{toc,auto:N-M}} —
           оглавление собирается из заголовков с номерами страниц
           (двухпроходный рендер, toc.js); ручной {{toc}} — без изменений */
        var spec = DG.toc.parseSpec(node.modsRaw);
        if (spec.auto) return DG.toc.autoNav(spec);
        inner = DG.util.el('nav', 'block-toc');
        renderBlocks(node.body || [], inner);
        return decorateToc(inner);
      }

      case 'column-count': {
        /* Директива колонок: pages.js применяет N колонок к текущей пустой
           странице или открывает новую (rev040-Н02); сам элемент в разворот
           не попадает. rev040-Н01: тело блока-директивы рендерится её
           дочерними элементами — pages.js отцепляет их и выкладывает
           первыми items на N-колоночной странице (текст больше не теряется). */
        var n = parseInt(firstParam(node.modsRaw), 10);
        if (!(n >= 1 && n <= 4)) n = 2;
        var dir = DG.util.el('div', 'block-colcount');
        dir.setAttribute('data-cols', String(n));
        renderBlocks(node.body || [], dir);
        return dir;
      }

      case 'pagenumber':
        /* нумерация страниц — в колонтитуле .page-foot (pages.js);
           токен сохраняем скрытым маркером совместимости */
        return DG.util.el('span', 'block-pagenumber');

      default:
        if (isImageMask(mod)) return imageMaskPlaceholder(node, mod);
        return unknownPlaceholder(node, mod);
    }
  }

  function imageMaskPlaceholder(node, mod) {
    var box = DG.util.el('div', 'img-ph img-ph--mask');
    box.appendChild(DG.util.el('span', 'img-ph-mark', { text: '⌧' }));
    box.appendChild(DG.util.el('span', 'img-ph-text', {
      text: '{{' + (node.modsRaw || mod) + '}} — оформление маски изображения: с v1.0.0 (fp №18)'
    }));
    /* содержимое (ссылка на картинку) показываем текстом внутри */
    var inner = DG.util.el('div', 'img-ph-inner');
    DG.render.renderBlocks(node.body || [], inner);
    box.appendChild(inner);
    return box;
  }

  function unknownPlaceholder(node, mod) {
    var box = DG.util.el('div', 'v3stub v3stub--unknown');
    var label = DG.util.el('div', 'v3stub-label');
    label.appendChild(DG.util.el('span', 'v3stub-chip', { text: '{{' + (node.modsRaw || '') + '}}' }));
    label.appendChild(DG.util.el('span', 'v3stub-note',
      { text: ' — модификатор не поддерживается; содержимое показано как текст' +
        (node.closed ? '' : ' (блок не закрыт }})') }));
    box.appendChild(label);
    var inner = DG.util.el('div', 'v3stub-inner');
    DG.render.renderBlocks(node.body || [], inner);
    box.appendChild(inner);
    return box;
  }

  return {
    render: render, firstMod: firstMod,
    decorateToc: decorateToc, tocHeading: tocHeading
  };
})();
