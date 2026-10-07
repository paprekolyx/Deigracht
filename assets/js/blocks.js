/* Deigracht — блоки Homebrewery V3 (blocks.js), волна v0.2.0 (fp №2 ч.2).
   Полное оформление блоков: wide / note / descriptive / monster (+___-
   статблоки) / toc (ручной, с точечными лидерами и номерами страниц) /
   column-count (директива колонок для страницы — pages.js) / pageNumber
   (скрытый маркер: нумерация живёт в колонтитуле .page-foot).
   {{imageMask*}} — плейсхолдер до v1.0.0 (fp №18, решение владельца).
   Неизвестный модификатор — видимая плашка (честное правило совместимости,
   otchet §1.4), а не молчаливая поломка.
   Безопасность: DOM строится программно (render.js), innerHTML не используется. */
'use strict';

DG.blocks = (function () {

  var KNOWN = {
    wide: 1, note: 1, descriptive: 1, monster: 1, toc: 1,
    'column-count': 1, pagenumber: 1
  };
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

  function decorateToc(box) {
    var links = box.querySelectorAll('a');
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      var label = a.textContent;
      var m = label.match(TOC_LABEL);
      a.className = 'toc-row';
      a.textContent = '';
      var title = DG.util.el('span', 'toc-title', { text: m ? m[1] : label });
      var dots = DG.util.el('span', 'toc-dots');
      a.appendChild(title);
      a.appendChild(dots);
      if (m) a.appendChild(DG.util.el('span', 'toc-page', { text: m[2] }));
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

      case 'toc':
        inner = DG.util.el('nav', 'block-toc');
        renderBlocks(node.body || [], inner);
        return decorateToc(inner);

      case 'column-count': {
        /* директива: pages.js закрывает текущую страницу и открывает
           новую с N колонками; сам элемент в разворот не попадает */
        var n = parseInt(firstParam(node.modsRaw), 10);
        if (!(n >= 1 && n <= 4)) n = 2;
        var dir = DG.util.el('div', 'block-colcount');
        dir.setAttribute('data-cols', String(n));
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

  return { render: render, firstMod: firstMod, decorateToc: decorateToc };
})();
