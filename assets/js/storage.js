/* Deigracht — хранение в браузере (storage.js), волна v0.1.0.
   Границы черновика (SECURITY §1): документы живут ТОЛЬКО в браузере
   пользователя (localStorage); сервера нет. Полная библиотека документов
   (IndexedDB) — fp №6, волна v0.9.0; экспорт самодостаточного .html —
   fp №7б, волна v0.3.0. Здесь — storage-минимум: автосохранение одного
   документа + экспорт/импорт .md (решение аналитика 07.10.2026 —
   сохранность данных до волны библиотеки). */
'use strict';

DG.storage = (function () {

  function key() { return DG.config.storageKey; }
  function skey() { return DG.config.settingsKey; }

  /* ---------- документ ---------- */

  function loadDoc() {
    try {
      var raw = localStorage.getItem(key());
      if (raw == null) return null; /* первый запуск — null (не {}) */
      var d = JSON.parse(raw);
      return (d && typeof d.md === 'string') ? d : null;
    } catch (e) { return null; }
  }

  /* Возвращает true при успехе; false — квота/ошибка (editor.js покажет
     предупреждение «экспортируйте .md»). */
  function saveDoc(md, title) {
    try {
      localStorage.setItem(key(), JSON.stringify({
        md: String(md), title: String(title || ''), ts: Date.now()
      }));
      return true;
    } catch (e) { return false; }
  }

  function docTs() {
    var d = loadDoc();
    return d ? d.ts : null;
  }

  /* ---------- настройки (формат печати и т.п.) ---------- */

  function loadSettings() {
    try { return JSON.parse(localStorage.getItem(skey()) || '{}') || {}; }
    catch (e) { return {}; }
  }
  function saveSettings(patch) {
    try {
      var s = loadSettings();
      for (var k in patch) s[k] = patch[k];
      localStorage.setItem(skey(), JSON.stringify(s));
    } catch (e) { /* настройки некритичны */ }
  }

  /* ---------- экспорт/импорт .md ---------- */

  function exportMd(md, title) {
    DG.util.download(DG.util.fileBase(title) + '.md', String(md), 'text/markdown');
  }

  function importFile(file, cb) {
    var r = new FileReader();
    r.onload = function () { cb(String(r.result), file.name); };
    r.onerror = function () { cb(null, file.name); };
    r.readAsText(file, 'utf-8');
  }

  /* ---------- демонстрационный документ (собственный текст проекта) ---------- */

  /* rev040-Н08 (v0.4.1): демо первого запуска соответствует текущей волне —
     оформленные блоки V3, автооглавление, дробление длинных таблиц, кнопка
     «Добавить блок» (pr040-М1); устаревшие обещания «v0.1.0/v0.2.0» и
     «до трёх уровней» удалены. Демо — де-факто [В]-артефакт (reestr §7.4):
     финальная проверка каждой волны сверяет его с составом волны. */
  function demoMd() {
    return [
      '```metadata',
      'title: Пример книги',
      "description: 'Демонстрационный документ Deigracht'",
      'renderer: V3',
      'theme: book',
      '```',
      '',
      '# Дейгрихт',
      '',
      'Это **демонстрационный документ** редактора. Слева — исходник Markdown,',
      'справа — книжный разворот. Правьте текст слева: превью обновляется на лету.',
      '',
      '## Что работает',
      '',
      '- заголовки, *курсив*, **жирный**, ***и то и другое***, `код`;',
      '- списки любой вложенности;',
      '- таблицы — как в книгах правил: длинная таблица дробится между',
      '  колонками и страницами, шапка повторяется на продолжении;',
      '- `\\page` — принудительный разрыв страницы;',
      '- блоки Homebrewery V3: `{{note}}`, `{{descriptive}}`, `{{monster}}`,',
      '  `{{wide}}`, `{{column-count:N}}` — кнопка **«Добавить блок»**;',
      '- автооглавление `{{toc,auto}}` — заголовки с номерами страниц;',
      '- печать и сохранение в PDF (Letter и A4), экспорт самодостаточного',
      '  .html — открывается без интернета.',
      '',
      '> Цитаты оформляются знаком «больше» в начале строки — так в книгах',
      '> правил выделяют текст для чтения вслух.',
      '',
      '| Приём | Поддержка |',
      '|---|---|',
      '| Таблицы и блоки V3 | оформлены |',
      '| Автооглавление `{{toc,auto}}` | с v0.4.0 |',
      '| Изображения и `{{imageMask}}` | плейсхолдеры до v1.0.0 |',
      '',
      '### Блоки Homebrewery V3',
      '',
      '{{note',
      'Врезка-рамка: домашнее правило, напоминание. Заготовки блоков вставляет',
      'кнопка «Добавить блок» — синтаксис учить не обязательно.',
      '}}',
      '',
      '{{toc,auto',
      '}}',
      '',
      '\\page',
      '',
      '# Вторая страница',
      '',
      'Всё, что после `\\page`, начинается с новой страницы. Номера страниц —',
      'внизу разворота. Документ автосохраняется в этом браузере; кнопка',
      '«Сохранить .md» скачивает файл (его можно открыть в Homebrewery).',
      '',
      '___',
      '',
      '*Изображения в черновике не отображаются (вместо них — плейсхолдер):',
      'полная поддержка картинок приедет в v1.0.0 (fp №18).*'
    ].join('\n');
  }

  return {
    loadDoc: loadDoc, saveDoc: saveDoc, docTs: docTs,
    loadSettings: loadSettings, saveSettings: saveSettings,
    exportMd: exportMd, importFile: importFile, demoMd: demoMd
  };
})();
