/* Deigracht — парсер Markdown + надстройка Homebrewery V3 (parser.js).
   Волна v0.1.0: Markdown-ядро (заголовки, абзацы, списки, таблицы, код,
   цитаты, ссылки, изображения-плейсхолдеры, \page, ```metadata```);
   блоки {{...}} распознаются и передаются в blocks.js (полная поддержка —
   волна v0.2.0, матрица совместимости — docs/plan/otchet.md §1.4).

   Безопасность (SECURITY §2): парсер возвращает только данные (AST);
   HTML-теги в исходнике НЕ исполняются — попадают в текст и экранируются
   на этапе render.js (textContent). innerHTML не используется.

   Ограничения v0.1.0 (техпаспорт §10): списки — до 3 уровней вложенности;
   setext-заголовки (подчёркиванием) не поддерживаются (--- трактуется как
   линейка); \page — только отдельной строкой. */
'use strict';

DG.parser = (function () {

  /* ---------- инлайн-разбор ---------- */

  var RE = {
    strongEmStar: /^\*\*\*([^*]+?)\*\*\*/,
    strongStar:   /^\*\*([\s\S]+?)\*\*/,
    emStar:       /^\*([^*\s][\s\S]*?)\*/,
    strongEmUnd:  /^___([^_]+?)___/,
    strongUnd:    /^__([\s\S]+?)__/,
    emUnd:        /^_([^_\s][\s\S]*?)_/,
    del:          /^~~([\s\S]+?)~~/,
    img:          /^!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+["'][^"']*["'])?\s*\)/,
    link:         /^\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+["'][^"']*["'])?\s*\)/,
    autolink:     /^<((?:https?|mailto):[^>\s]+)>/,
    code:         /^`([^`]+)`/
  };
  var ESCAPABLE = /[\\`*_{}\[\]()#+\-.!>~|]/;

  function parseInline(src) {
    var s = String(src);
    var out = [], buf = '', i = 0;

    function pushText() {
      if (buf) { out.push({ t: 'text', v: buf }); buf = ''; }
    }
    function pushNode(node) { pushText(); out.push(node); }

    while (i < s.length) {
      var c = s[i];

      /* экранирование \*  \|  и т.п. */
      if (c === '\\' && i + 1 < s.length && ESCAPABLE.test(s[i + 1])) {
        buf += s[i + 1]; i += 2; continue;
      }
      var rest = s.slice(i), m;

      if (c === '\n') { buf += ' '; i++; continue; } /* мягкий перенос */

      if (c === '`' && (m = rest.match(RE.code))) {
        pushNode({ t: 'code', v: m[1] }); i += m[0].length; continue;
      }
      if (c === '!' && (m = rest.match(RE.img))) {
        pushNode({ t: 'img', alt: m[1], src: m[2] }); i += m[0].length; continue;
      }
      if (c === '[' && (m = rest.match(RE.link))) {
        pushNode({ t: 'a', href: m[2], in: parseInline(m[1]) }); i += m[0].length; continue;
      }
      if (c === '<' && (m = rest.match(RE.autolink))) {
        pushNode({ t: 'a', href: m[1], in: [{ t: 'text', v: m[1] }] }); i += m[0].length; continue;
      }
      if (c === '~' && (m = rest.match(RE.del))) {
        pushNode({ t: 'del', in: parseInline(m[1]) }); i += m[0].length; continue;
      }
      if (c === '*' || c === '_') {
        var pairs = c === '*'
          ? [[RE.strongEmStar, 'bi'], [RE.strongStar, 'b'], [RE.emStar, 'i']]
          : [[RE.strongEmUnd, 'bi'], [RE.strongUnd, 'b'], [RE.emUnd, 'i']];
        var matched = false;
        for (var p = 0; p < pairs.length; p++) {
          m = rest.match(pairs[p][0]);
          if (m) {
            pushNode({ t: pairs[p][1], in: parseInline(m[1]) });
            i += m[0].length; matched = true; break;
          }
        }
        if (matched) continue;
      }
      buf += c; i++;
    }
    pushText();
    return out;
  }

  /* ---------- блочный разбор ---------- */

  function isBlank(l) { return l.trim() === ''; }
  function indentOf(l) { return l.match(/^ */)[0].length; }

  var RE_HEAD = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
  var RE_HR = /^(\s*)(_{3,}|-{3,}|\*{3,})\s*$/;
  var RE_FENCE = /^```([\w-]*)\s*$/;
  var RE_V3OPEN = /^\{\{\s*([\w\-]+(?:\s*[:,][^}]*)?)?\s*(\}\})?\s*$/;
  var RE_V3CLOSE = /^\}\}\s*$/;
  var RE_QUOTE = /^>\s?(.*)$/;
  var RE_LIST = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
  var RE_IMG_LINE = /^!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+["'][^"']*["'])?\s*\)\s*$/;
  var RE_TABLE = /^\|.*\|?\s*$/;

  function startsNewBlock(line) {
    return RE_HEAD.test(line) || RE_FENCE.test(line.trim()) || RE_HR.test(line) ||
      RE_V3OPEN.test(line.trim()) || line.trim() === '\\page' ||
      RE_TABLE.test(line) || RE_QUOTE.test(line) || RE_LIST.test(line);
  }

  /* Ячейки таблицы: \| — экранированный разделитель */
  function splitRow(line) {
    var s = line.trim().replace(/^\|/, '').replace(/\|$/, '');
    s = s.replace(/\\\|/g, '\u0000');
    return s.split('|').map(function (c) { return c.replace(/\u0000/g, '|').trim(); });
  }
  function isSepRow(cells) {
    return cells.length > 0 && cells.every(function (c) { return /^:?-{1,}:?$/.test(c); });
  }

  function parseBlocks(lines, from, to) {
    var out = [], i = from;

    while (i < to) {
      var line = lines[i];
      if (isBlank(line)) { i++; continue; }

      /* --- блок {{...}} (V3) --- */
      var trimmed = line.trim();
      var mv3 = trimmed.match(RE_V3OPEN);
      if (mv3) {
        var modsRaw = (mv3[1] || '').trim();
        /* однострочный блок, закрытый здесь же: {{pageNumber,auto}} */
        if (mv3[2]) {
          out.push({ t: 'v3', modsRaw: modsRaw, closed: true, body: [] });
          i++; continue;
        }
        var body = [], j = i + 1, closed = false;
        while (j < to) {
          if (RE_V3CLOSE.test(lines[j].trim())) { closed = true; break; }
          body.push(lines[j]); j++;
        }
        if (!closed) j = to; /* оборванный блок — до конца фрагмента */
        out.push({
          t: 'v3', modsRaw: modsRaw, closed: closed,
          body: parseBlocks(body, 0, body.length)
        });
        i = j + 1; continue;
      }

      /* --- код-блок --- */
      if (RE_FENCE.test(trimmed)) {
        var lang = trimmed.match(RE_FENCE)[1] || '';
        var code = [], k = i + 1;
        while (k < to && !RE_FENCE.test(lines[k].trim())) { code.push(lines[k]); k++; }
        out.push({ t: 'code', lang: lang, text: code.join('\n') });
        i = Math.min(k + 1, to); continue;
      }

      /* --- \page --- */
      if (trimmed === '\\page') { out.push({ t: 'pagebreak' }); i++; continue; }

      /* --- заголовок --- */
      var mh = line.match(RE_HEAD);
      if (mh) {
        out.push({ t: 'heading', lvl: mh[1].length, in: parseInline(mh[2]) });
        i++; continue;
      }

      /* --- линейка (___ / --- / ***) --- */
      var mr = line.match(RE_HR);
      if (mr) { out.push({ t: 'hr', kind: mr[2][0] }); i++; continue; }

      /* --- картинка отдельной строкой (плейсхолдер до v1.0.0 — fp №18) --- */
      var mi = line.trim().match(RE_IMG_LINE);
      if (mi) { out.push({ t: 'imgfig', alt: mi[1], src: mi[2] }); i++; continue; }

      /* --- таблица --- */
      if (RE_TABLE.test(line.trim()) && line.trim()[0] === '|') {
        var rows = [];
        while (i < to && lines[i].trim()[0] === '|' && !isBlank(lines[i])) {
          rows.push(splitRow(lines[i])); i++;
        }
        var align = [], head = null;
        if (rows.length >= 2 && isSepRow(rows[1])) {
          head = rows[0];
          align = rows[1].map(function (c) {
            var l = c[0] === ':', r = c[c.length - 1] === ':';
            return l && r ? 'center' : r ? 'right' : l ? 'left' : '';
          });
          rows.splice(0, 2);
        }
        out.push({
          t: 'table', align: align,
          head: head ? head.map(parseInline) : null,
          rows: rows.map(function (r) { return r.map(parseInline); })
        });
        continue;
      }

      /* --- цитата --- */
      if (RE_QUOTE.test(line)) {
        var q = [];
        while (i < to && (RE_QUOTE.test(lines[i]) || (!isBlank(lines[i]) && q.length && !startsNewBlock(lines[i])))) {
          var mm = lines[i].match(RE_QUOTE);
          q.push(mm ? mm[1] : lines[i]); i++;
        }
        out.push({ t: 'quote', in: parseInline(q.join('\n')) });
        continue;
      }

      /* --- список --- */
      if (RE_LIST.test(line)) {
        var res = parseList(lines, i, to);
        out.push(res.node); i = res.next; continue;
      }

      /* --- абзац --- */
      var para = [line];
      i++;
      while (i < to && !isBlank(lines[i]) && !startsNewBlock(lines[i])) {
        para.push(lines[i]); i++;
      }
      out.push({ t: 'para', in: parseInline(para.join('\n')) });
    }
    return out;
  }

  function parseList(lines, start, to) {
    var base = indentOf(lines[start]);
    var first = lines[start].match(RE_LIST);
    var ordered = /\d/.test(first[2]);
    var items = [];
    var i = start;

    function markerAt(idx) {
      if (idx >= to) return null;
      var m = lines[idx].match(RE_LIST);
      return m ? { indent: indentOf(lines[idx]), text: m[3], ord: /\d/.test(m[2]) } : null;
    }

    while (i < to) {
      var mk = markerAt(i);
      if (mk && mk.indent <= base && mk.ord !== ordered) break; /* сменился тип списка */
      if (mk && mk.indent <= base) {
        items.push({ in: parseInline(mk.text), sub: null });
        i++;
        /* вложенный список — следующие строки с большим отступом */
        if (i < to) {
          var nx = markerAt(i);
          if (nx && nx.indent > base) {
            var sub = parseList(lines, i, to);
            items[items.length - 1].sub = sub.node;
            i = sub.next;
          } else {
            /* продолжение текста элемента (отступ, не маркер) */
            while (i < to && !isBlank(lines[i]) && !markerAt(i) && indentOf(lines[i]) > base) {
              items[items.length - 1].in = items[items.length - 1].in.concat(
                [{ t: 'text', v: ' ' }], parseInline(lines[i].trim()));
              i++;
            }
          }
        }
        continue;
      }
      if (isBlank(lines[i])) {
        /* пустая строка внутри списка допустима, если дальше маркер
           ТОГО ЖЕ типа (иначе — новый список, markdown loose-list) */
        var ahead = i + 1;
        while (ahead < to && isBlank(lines[ahead])) ahead++;
        var am = markerAt(ahead);
        if (am && am.indent >= base && am.ord === ordered) { i = ahead; continue; }
        break;
      }
      break; /* не список больше */
    }
    return { node: { t: 'list', ordered: ordered, items: items }, next: i };
  }

  /* ---------- metadata ---------- */

  function parseMetadata(lines) {
    /* ```metadata ... ``` в начале документа */
    var i = 0;
    while (i < lines.length && isBlank(lines[i])) i++;
    if (!/^```metadata\s*$/.test((lines[i] || '').trim())) return { meta: null, from: 0 };
    var meta = {}, j = i + 1;
    while (j < lines.length && !/^```\s*$/.test(lines[j].trim())) {
      var m = lines[j].match(/^\s*([\w-]+)\s*:\s*(.*)$/);
      if (m) meta[m[1].toLowerCase()] = m[2].trim();
      j++;
    }
    return { meta: meta, from: Math.min(j + 1, lines.length) };
  }

  /* ---------- точка входа ---------- */

  function parse(src) {
    var lines = String(src == null ? '' : src).replace(/\r\n?/g, '\n').split('\n');
    var md = parseMetadata(lines);
    return {
      meta: md.meta,
      blocks: parseBlocks(lines, md.from, lines.length)
    };
  }

  return { parse: parse, parseInline: parseInline, parseBlocks: parseBlocks };
})();
