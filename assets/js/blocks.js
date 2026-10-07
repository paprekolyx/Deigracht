/* Deigracht — блоки Homebrewery V3 (blocks.js).
   Волна v0.1.0 — ЗАГЛУШКА по DoD: блоки {{...}} распознаются парсером
   и рендерятся как помеченный контейнер «блок будет поддержан в v0.2.0»
   с обычным отображением внутреннего Markdown (документ остаётся читаемым).
   Полная поддержка (wide/note/descriptive/monster/toc/column-count/
   pageNumber — fp №2 ч.2) — волна v0.2.0; imageMask — v1.0.0 (fp №18).
   Честное правило совместимости (otchet §1.4): неизвестный/неподдержанный
   модификатор показывается видимой плашкой, а не молча ломается. */
'use strict';

DG.blocks = (function () {

  /* Модификаторы, запланированные к полной поддержке в v0.2.0 */
  var PLANNED_V020 = {
    wide: 1, note: 1, descriptive: 1, monster: 1, toc: 1,
    'column-count': 1, pagenumber: 1
  };
  /* imageMask* — волна v1.0.0 (fp №18) */
  function isImageMask(mod) { return /^imagemask/i.test(mod); }

  function firstMod(modsRaw) {
    var s = String(modsRaw || '').split(/[,;]/)[0].split(/[:]/)[0].trim().toLowerCase();
    return s;
  }

  /* node — AST {t:'v3', modsRaw, closed, body}; renderBlocks — функция
     из render.js (рендер вложенных блоков). Возвращает DOM-элемент. */
  function renderStub(node, renderBlocks) {
    var mod = firstMod(node.modsRaw);
    var planned = PLANNED_V020[mod] ? 'v0.2.0' : (isImageMask(mod) ? 'v1.0.0 (fp №18)' : 'не известен — проверьте синтаксис');

    var box = DG.util.el('div', 'v3stub');
    box.setAttribute('data-mod', mod || '');

    var label = DG.util.el('div', 'v3stub-label');
    var chip = DG.util.el('span', 'v3stub-chip', { text: '{{' + (node.modsRaw || '') + '}}' });
    var note = DG.util.el('span', 'v3stub-note',
      { text: ' — оформление блока: ' + planned + (node.closed ? '' : ' (блок не закрыт }} — проверьте исходник)') });
    label.appendChild(chip);
    label.appendChild(note);
    box.appendChild(label);

    /* содержимое блока — обычным Markdown (читаемость эталона в v0.1.0) */
    var inner = DG.util.el('div', 'v3stub-inner');
    renderBlocks(node.body || [], inner);
    box.appendChild(inner);
    return box;
  }

  return { renderStub: renderStub, firstMod: firstMod };
})();
