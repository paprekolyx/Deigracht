/* Deigracht — рендер AST в DOM (render.js), волна v0.1.0.
   Безопасность (SECURITY §2): всё строится программно
   (createElement/createTextNode); пользовательский текст попадает только
   в textContent — innerHTML не используется; ссылки проходят safeUrl().
   Изображения — плейсхолдеры до v1.0.0 (решение владельца 07.10.2026,
   fp №18): ![alt](url) не грузится, показывается рамка с alt-текстом. */
'use strict';

DG.render = (function () {

  var el = null; /* DG.util.el — инициализируется лениво (порядок скриптов) */
  function E() { if (!el) el = DG.util.el; return el; }

  /* ---------- инлайны ---------- */

  function renderInline(nodes, parent) {
    (nodes || []).forEach(function (n) {
      switch (n.t) {
        case 'text':
          parent.appendChild(document.createTextNode(n.v)); break;
        case 'b': {
          var b = E()('strong'); renderInline(n.in, b); parent.appendChild(b); break;
        }
        case 'i': {
          var i2 = E()('em'); renderInline(n.in, i2); parent.appendChild(i2); break;
        }
        case 'bi': {
          var bs = E()('strong'), bi = E()('em');
          renderInline(n.in, bi); bs.appendChild(bi); parent.appendChild(bs); break;
        }
        case 'del': {
          var d = E()('del'); renderInline(n.in, d); parent.appendChild(d); break;
        }
        case 'code':
          parent.appendChild(E()('code', null, { text: n.v })); break;
        case 'a': {
          var href = DG.util.safeUrl(n.href);
          if (href) {
            var a = E()('a');
            a.setAttribute('href', href);
            if (!href.startsWith('#')) {
              a.setAttribute('target', '_blank');
              a.setAttribute('rel', 'noopener noreferrer');
            }
            renderInline(n.in, a);
            parent.appendChild(a);
          } else {
            /* отклонённая схема — видимый текст без ссылки (safeUrl) */
            var bad = E()('span', 'badlink', { title: 'Ссылка отклонена: разрешены только http/https и относительные (safeUrl)' });
            renderInline(n.in, bad);
            parent.appendChild(bad);
          }
          break;
        }
        case 'img':
          parent.appendChild(imgPlaceholder(n.alt, n.src, true)); break;
        default:
          parent.appendChild(document.createTextNode(''));
      }
    });
    return parent;
  }

  /* Плейсхолдер изображения (до v1.0.0 — fp №18) */
  function imgPlaceholder(alt, src, inline) {
    var safe = DG.util.safeUrl(src);
    var box = E()(inline ? 'span' : 'div', inline ? 'img-ph img-ph--inline' : 'img-ph');
    box.appendChild(E()('span', 'img-ph-mark', { text: '⌧' }));
    box.appendChild(E()('span', 'img-ph-text', {
      text: 'Изображение: ' + (alt || '(без подписи)') +
        (safe ? '' : ' [ссылка отклонена safeUrl]') +
        ' — отображается с v1.0.0 (fp №18)'
    }));
    return box;
  }

  /* ---------- блоки ---------- */

  function blockToElement(node) {
    switch (node.t) {
      case 'heading': {
        var lvl = Math.max(1, Math.min(6, node.lvl));
        var h = E()('h' + lvl);
        renderInline(node.in, h);
        return h;
      }
      case 'para': {
        var p = E()('p');
        renderInline(node.in, p);
        return p;
      }
      case 'quote': {
        var q = E()('blockquote'), qp = E()('p');
        renderInline(node.in, qp); q.appendChild(qp);
        return q;
      }
      case 'hr':
        return E()('hr', 'rule rule--' + (node.kind === '_' ? 'double' : 'single'));
      case 'code': {
        var pre = E()('pre'), code = E()('code');
        if (node.lang) code.setAttribute('data-lang', node.lang);
        code.textContent = node.text;
        pre.appendChild(code);
        return pre;
      }
      case 'imgfig':
        return imgPlaceholder(node.alt, node.src, false);
      case 'list':
        return renderList(node);
      case 'table':
        return renderTable(node);
      case 'v3':
        return DG.blocks.renderStub(node, renderBlocks);
      default:
        return E()('p', 'unknown-block', { text: '[нераспознанный блок]' });
    }
  }

  function renderList(node) {
    var list = E()(node.ordered ? 'ol' : 'ul');
    (node.items || []).forEach(function (it) {
      var li = E()('li');
      renderInline(it.in, li);
      if (it.sub) li.appendChild(renderList(it.sub));
      list.appendChild(li);
    });
    return list;
  }

  function renderTable(node) {
    var wrap = E()('div', 'table-wrap');
    var t = E()('table', 'book-table');
    var colCount = 0;
    if (node.head) {
      colCount = node.head.length;
      var thead = E()('thead'), htr = E()('tr');
      node.head.forEach(function (cells, ci) {
        var th = E()('th');
        if (node.align[ci]) th.style.textAlign = node.align[ci];
        renderInline(cells, th);
        htr.appendChild(th);
      });
      thead.appendChild(htr); t.appendChild(thead);
    }
    var tbody = E()('tbody');
    (node.rows || []).forEach(function (r) {
      colCount = Math.max(colCount, r.length);
      var tr = E()('tr');
      r.forEach(function (cells, ci) {
        var td = E()('td');
        if (node.align[ci]) td.style.textAlign = node.align[ci];
        renderInline(cells, td);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    t.appendChild(tbody);
    wrap.appendChild(t);
    return wrap;
  }

  /* Массив элементов для пагинации: Element | {marker:true} (\page) */
  function blocksToItems(blocks) {
    var items = [];
    (blocks || []).forEach(function (b) {
      if (b.t === 'pagebreak') items.push({ marker: true });
      else if (b.t === 'meta') { /* не рендерится */ }
      else items.push(blockToElement(b));
    });
    return items;
  }

  /* Прямой рендер в контейнер (вложенные блоки v3-заглушек) */
  function renderBlocks(blocks, container) {
    blocksToItems(blocks).forEach(function (it) {
      if (it.marker) container.appendChild(E()('div', 'pagebreak-inline', { text: '\\page' }));
      else container.appendChild(it);
    });
    return container;
  }

  return {
    blocksToItems: blocksToItems,
    renderBlocks: renderBlocks,
    renderInline: renderInline
  };
})();
