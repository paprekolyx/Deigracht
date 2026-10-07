/* Deigracht — печать и PDF (pdf.js), волна v0.1.0 (fp №4).
   Принципы: 1 экранная страница = 1 печатная; @page-геометрия задаётся
   форматом (ADR-003 ред. 1.1: переключатель A4/Letter, дефолт Letter —
   геометрия эталона владельца, ВЛ-07). Требование владельца (07.10.2026):
   пока открыто модальное окно печати — скролл основной части сайта
   ЗАБЛОКИРОВАН (html.modal-lock { overflow: hidden }). */
'use strict';

DG.pdf = (function () {

  var modal, pagesEl, styleEl, radios;

  function currentFormat() {
    var f = (pagesEl && pagesEl.getAttribute('data-format')) || DG.config.defaultFormat;
    return DG.config.formats[f] ? f : DG.config.defaultFormat;
  }

  function applyFormat(fmt) {
    if (!DG.config.formats[fmt]) fmt = DG.config.defaultFormat;
    pagesEl.setAttribute('data-format', fmt);
    DG.storage.saveSettings({ format: fmt });
    var label = document.getElementById('format-label');
    if (label) label.textContent = '· ' + fmt.toUpperCase();
    /* @page-геометрия для печати — инъекцией стиля (CSP style-src
       допускает 'unsafe-inline' — SECURITY §2) */
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'page-style';
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = '@page { size: ' + DG.config.formats[fmt].pageCss + '; margin: 0; }';
  }

  /* ---------- блокировка фонового скролла (требование владельца) ---------- */

  var lockScroll = null;
  function lock() {
    if (lockScroll !== null) return;
    lockScroll = window.scrollY || 0;
    var sbw = window.innerWidth - document.documentElement.clientWidth;
    document.documentElement.classList.add('modal-lock');
    if (sbw > 0) document.documentElement.style.paddingRight = sbw + 'px';
  }
  function unlock() {
    if (lockScroll === null) return;
    document.documentElement.classList.remove('modal-lock');
    document.documentElement.style.paddingRight = '';
    lockScroll = null;
  }

  /* ---------- модальное окно ---------- */

  function open() {
    var fmt = currentFormat();
    radios.forEach(function (r) { r.checked = (r.value === fmt); });
    modal.hidden = false;
    lock();
    var first = modal.querySelector('input, button');
    if (first) first.focus();
  }

  function close() {
    modal.hidden = true;
    unlock();
  }

  function doPrint() {
    var picked = null;
    radios.forEach(function (r) { if (r.checked) picked = r.value; });
    if (picked && picked !== currentFormat()) applyFormat(picked);
    close();
    /* дать браузеру переложить геометрию до печати */
    setTimeout(function () { window.print(); }, 60);
  }

  function init() {
    modal = document.getElementById('print-modal');
    pagesEl = document.getElementById('pages');
    radios = Array.prototype.slice.call(modal.querySelectorAll('input[name="page-format"]'));

    var settings = DG.storage.loadSettings();
    applyFormat(settings.format && DG.config.formats[settings.format]
      ? settings.format : DG.config.defaultFormat);

    modal.querySelector('#print-go').addEventListener('click', doPrint);
    modal.querySelector('#print-cancel').addEventListener('click', close);
    modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !modal.hidden) close();
    });
    /* подсказки формата из config */
    radios.forEach(function (r) {
      var f = DG.config.formats[r.value];
      if (f) {
        var span = r.parentNode.querySelector('.fmt-label');
        if (span) span.textContent = f.label;
      }
    });
  }

  return { init: init, open: open, close: close, applyFormat: applyFormat, currentFormat: currentFormat };
})();
