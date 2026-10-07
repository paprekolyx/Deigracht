/* Deigracht — общие утилиты (util.js, волна v0.1.0).
   Паттерны безопасности (SECURITY §2): safeUrl — whitelist схем ссылок
   с очисткой от управляющих символов ДО проверки схемы; вывод — только
   программным DOM (textContent/createElement), innerHTML для
   пользовательского текста не используется нигде в проекте. */
'use strict';

DG.util = (function () {

  /* Экранирование для редких случаев сборки строк разметки (экспорт .html
     появится в v0.3.0 — функция уже здесь, используется и в статусах). */
  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* Whitelist схем URL (SECURITY §2): http/https + относительные + якоря.
     javascript:, data: и прочие — отклоняются. Управляющие символы,
     нулевые байты и пробелы вычищаются до проверки (обход «java\tscript:»).
     Возвращает очищенный URL или null. */
  function safeUrl(raw) {
    if (raw == null) return null;
    let s = String(raw).replace(/[\u0000-\u0020\u007F-\u00A0\s]+/g, '');
    if (!s) return null;
    if (s.startsWith('#') || s.startsWith('/') || /^\.{0,2}\//.test(s)) return s;
    if (/^https?:\/\//i.test(s)) return s;
    if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return null; /* прочая схема */
    return s; /* относительный без слэша */
  }

  function debounce(fn, ms) {
    let t = null;
    return function () {
      const args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, ms);
    };
  }

  /* Создание элемента: el('div', 'class', {атрибуты}, [дети]) */
  function el(tag, cls, attrs, kids) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (attrs) for (const k in attrs) {
      if (k === 'text') n.textContent = attrs[k];
      else n.setAttribute(k, attrs[k]);
    }
    if (kids) kids.forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }

  /* Скачать файл (экспорт .md — storage.js) */
  function download(filename, text, mime) {
    const blob = new Blob([text], { type: (mime || 'text/markdown') + ';charset=utf-8' });
    const a = el('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /* Счётчики для статус-бара */
  function countWords(s) {
    const m = String(s).match(/[A-Za-zА-Яа-яЁё0-9_\-']+/g);
    return m ? m.length : 0;
  }

  /* Безопасное имя файла из заголовка документа */
  function fileBase(title) {
    const t = String(title || 'dokument').replace(/[\\/:*?"<>|]+/g, '').trim();
    return (t || 'dokument').slice(0, 80);
  }

  /* Транслитерация не нужна: имена файлов допускают кириллицу,
     но для переносимости между ОС оставляем как есть — решение v0.1.0. */

  return {
    esc: esc, safeUrl: safeUrl, debounce: debounce, el: el,
    download: download, countWords: countWords, fileBase: fileBase
  };
})();
