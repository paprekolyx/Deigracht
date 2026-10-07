/* Deigracht — конфигурация проекта.
   SITE_VERSION — точка синхронизации версий (регламент §1.4): значение
   обязано совпадать с шапками README.md / LICENSE.md / SECURITY.md
   (сверяет tests/check-repo.py). Секреты и ключи в этом файле не хранятся
   никогда — сервера нет (SECURITY.md §1). Волна v0.1.1.
   rev040-Н07 (v0.4.1): const верхнего уровня классического скрипта не
   становится свойством window — версия для всех модулей живёт в
   DG.config.siteVersion (help.js, export.js, editor.js). */
'use strict';

const SITE_VERSION = '0.4.1-draft';

/* Единое пространство имён модулей (vanilla JS без сборки — ADR-001). */
window.DG = window.DG || {};

DG.config = {
  /* Версия сайта — единственный источник для модулей (rev040-Н07) */
  siteVersion: SITE_VERSION,

  /* Хранилище браузера (SECURITY §1: документы не покидают устройство) */
  storageKey: 'deigracht:doc:v1',
  settingsKey: 'deigracht:settings:v1',

  /* Тайминги редактора (fp №1) */
  renderDebounceMs: 300,
  autosaveMs: 1000,

  /* Геометрия страницы (ADR-003 ред. 1.1, ВЛ-07): переключатель A4/Letter,
     дефолт Letter — геометрия эталона. Значения продублированы в CSS
     (tokens.css) — здесь используются для печати (@page) и pdf.js. */
  formats: {
    letter: { label: 'Letter (215,9 × 279,4 мм)', pageCss: '8.5in 11in' },
    a4:     { label: 'A4 (210 × 297 мм)',         pageCss: '210mm 297mm' }
  },
  defaultFormat: 'letter',

  /* Пагинация (pages.js): батч измерения — компромисс скорость/точность */
  paginateBatch: 8,

  /* Ограничения черновика (техпаспорт §10) */
  limits: {
    maxDocChars: 2000000,   /* мягкий лимит исходника — предупреждение */
    autosaveMaxChars: 4000000 /* оценка порога localStorage (~5 МБ) */
  }
};
