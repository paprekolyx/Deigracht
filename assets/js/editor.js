/* Deigracht — редактор (editor.js), волна v0.1.0 (fp №1).
   Две панели (исходник / разворот), debounce-рендер ~300 мс, синхронная
   прокрутка по пропорции, счётчики, горячие клавиши (Ctrl+S — сохранить,
   Ctrl+P — печать), автосохранение (storage-минимум), открытие/импорт .md
   (клик и drag&drop), перетаскиваемая граница панелей. */
'use strict';

DG.editor = (function () {

  var src, pagesEl, pagesScroll, saveStateEl, warnEl;
  var cntPages, cntWords, cntChars;
  var lastTitle = 'Без названия';
  var storageOk = true;
  var syncing = false;

  /* ---------- конвейер рендера ---------- */

  function renderNow() {
    var text = src.value;
    var doc = DG.parser.parse(text);
    lastTitle = (doc.meta && doc.meta.title) || 'Без названия';

    /* автооглавление (fp №11, волна v0.4.0): двухпроходный рендер —
       проход 1 с заглушками «…», проход 2 с номерами из карты страниц;
       при расхождении карты — до 3 проходов до устойчивости (toc.js) */
    DG.toc.reset(DG.toc.collectHeadings(doc.blocks));
    DG.pages.docTitle = lastTitle;
    var res = null, pass = 0, stable = false;
    while (pass < 3 && !stable) {
      var items = DG.render.blocksToItems(doc.blocks);
      res = DG.pages.paginate(items, pagesEl);
      stable = DG.toc.collect(doc.blocks, pagesEl);
      pass++;
    }

    /* счётчики */
    cntPages.textContent = 'страниц: ' + res.pages;
    cntWords.textContent = 'слов: ' + DG.util.countWords(text);
    cntChars.textContent = 'знаков: ' + text.length.toLocaleString('ru-RU');

    /* предупреждения (честные границы — техпаспорт §10) */
    var warns = [];
    if (res.overflowBlocks.length) {
      warns.push('блоков крупнее страницы: ' + res.overflowBlocks.length +
        ' (помечены на развороте; добавьте \\page или разбейте вручную)');
    }
    if (!stable) {
      warns.push('автооглавление не сошлось за 3 прохода (рядом с оглавлением '
        + 'граница страницы или \\page): номера могут отставать на один '
        + 'проход — добавьте \\page после оглавления');
    }
    var unclosed = countUnclosed(doc.blocks);
    if (unclosed) warns.push('незакрытых блоков {{…}}: ' + unclosed);
    if (text.length > DG.config.limits.maxDocChars) {
      warns.push('документ очень большой — возможны задержки рендера');
    }
    warnEl.textContent = warns.join(' · ');
    warnEl.title = warns.join('\n');
  }

  function countUnclosed(blocks) {
    var n = 0;
    (blocks || []).forEach(function (b) {
      if (b.t === 'v3') {
        if (!b.closed) n++;
        n += countUnclosed(b.body);
      }
    });
    return n;
  }

  /* ---------- сохранение ---------- */

  function setSaveState(text, cls) {
    saveStateEl.textContent = text;
    saveStateEl.className = cls || '';
  }

  function saveNow() {
    var ok = DG.storage.saveDoc(src.value, lastTitle);
    storageOk = ok;
    if (ok) {
      var t = new Date();
      setSaveState('сохранено в ' + t.toLocaleTimeString('ru-RU',
        { hour: '2-digit', minute: '2-digit', second: '2-digit' }), 'saved');
    } else {
      setSaveState('хранилище браузера переполнено — экспортируйте .md!', 'error');
    }
  }

  /* ---------- синхронная прокрутка (приблизительная, по пропорции) ---------- */

  function syncScroll() {
    if (syncing) return;
    var maxA = src.scrollHeight - src.clientHeight;
    var maxB = pagesScroll.scrollHeight - pagesScroll.clientHeight;
    if (maxA <= 0 || maxB <= 0) return;
    syncing = true;
    pagesScroll.scrollTop = (src.scrollTop / maxA) * maxB;
    requestAnimationFrame(function () { syncing = false; });
  }

  /* ---------- граница панелей ---------- */

  function initDivider() {
    var divider = document.getElementById('divider');
    var paneEd = document.getElementById('pane-editor');
    var workspace = document.getElementById('workspace');
    var dragging = false;

    divider.addEventListener('pointerdown', function (e) {
      dragging = true;
      divider.setPointerCapture(e.pointerId);
      document.body.classList.add('dragging');
    });
    divider.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var r = workspace.getBoundingClientRect();
      var pct = ((e.clientX - r.left) / r.width) * 100;
      pct = Math.max(20, Math.min(80, pct));
      paneEd.style.flexBasis = pct + '%';
    });
    divider.addEventListener('pointerup', function () {
      if (!dragging) return;
      dragging = false;
      document.body.classList.remove('dragging');
      DG.storage.saveSettings({ editorPct: paneEd.style.flexBasis });
    });

    var s = DG.storage.loadSettings();
    if (s.editorPct) paneEd.style.flexBasis = s.editorPct;
  }

  /* ---------- файлы ---------- */

  function loadText(text, name) {
    src.value = String(text == null ? '' : text);
    renderNow();
    saveNow();
    if (name) setSaveState('открыт файл: ' + name, 'saved');
  }

  function initFileOpen() {
    var input = document.getElementById('file-open');
    var btn = document.getElementById('btn-open');
    btn.addEventListener('click', function () { input.click(); });
    input.addEventListener('change', function () {
      if (!input.files || !input.files[0]) return;
      DG.storage.importFile(input.files[0], function (text, name) {
        if (text == null) { setSaveState('не удалось прочитать файл', 'error'); return; }
        loadText(text, name);
      });
      input.value = '';
    });
    /* drag&drop на панель исходника */
    src.addEventListener('dragover', function (e) { e.preventDefault(); });
    src.addEventListener('drop', function (e) {
      e.preventDefault();
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (!f) return;
      DG.storage.importFile(f, function (text, name) {
        if (text == null) { setSaveState('не удалось прочитать файл', 'error'); return; }
        loadText(text, name);
      });
    });
  }

  /* ---------- горячие клавиши ---------- */

  function initHotkeys() {
    document.addEventListener('keydown', function (e) {
      var mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (e.key === 's' || e.key === 'S' || e.key === 'ы' || e.key === 'Ы') {
        e.preventDefault();
        saveNow();
      } else if (e.key === 'p' || e.key === 'P' || e.key === 'з' || e.key === 'З') {
        var modal = document.getElementById('print-modal');
        if (modal && !modal.hidden) return; /* в модалке — нативная печать */
        e.preventDefault();
        DG.pdf.open();
      }
    });
  }

  /* ---------- инициализация ---------- */

  function init() {
    src = document.getElementById('src');
    pagesEl = document.getElementById('pages');
    pagesScroll = document.getElementById('pages-scroll');
    saveStateEl = document.getElementById('save-state');
    warnEl = document.getElementById('warnings');
    cntPages = document.getElementById('cnt-pages');
    cntWords = document.getElementById('cnt-words');
    cntChars = document.getElementById('cnt-chars');

    /* версия — точка синхронизации (регламент §1.4) */
    ['version', 'version2'].forEach(function (id) {
      var n = document.getElementById(id);
      if (n) n.textContent = SITE_VERSION;
    });

    DG.pdf.init();
    initDivider();
    initFileOpen();
    initHotkeys();

    document.getElementById('btn-save').addEventListener('click', function () {
      DG.storage.exportMd(src.value, lastTitle);
      setSaveState('файл .md скачан', 'saved');
    });
    document.getElementById('btn-demo').addEventListener('click', function () {
      if (src.value.trim() && !window.confirm('Заменить текущий документ примером?')) return;
      loadText(DG.storage.demoMd(), null);
      setSaveState('загружен демонстрационный документ', 'saved');
    });
    document.getElementById('btn-print').addEventListener('click', function () {
      DG.pdf.open();
    });

    /* сниппеты (fp №10): меню заготовок — вставка в курсор */
    var snipBtn = document.getElementById('btn-snippets');
    var snipMenu = document.getElementById('snippets-menu');
    DG.snippets.list().forEach(function (sn) {
      var b = DG.util.el('button', 'menu-item', { type: 'button', text: sn.label });
      b.setAttribute('role', 'menuitem');
      b.addEventListener('click', function () {
        DG.snippets.insertInto(src, sn.text);
        snipMenu.hidden = true;
        snipBtn.setAttribute('aria-expanded', 'false');
      });
      snipMenu.appendChild(b);
    });
    snipBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      snipMenu.hidden = !snipMenu.hidden;
      snipBtn.setAttribute('aria-expanded', String(!snipMenu.hidden));
    });
    document.addEventListener('click', function (e) {
      if (!snipMenu.hidden && !e.target.closest('.menu-wrap')) {
        snipMenu.hidden = true;
        snipBtn.setAttribute('aria-expanded', 'false');
      }
    });

    /* экспорт самодостаточного .html (fp №7б) */
    document.getElementById('btn-export').addEventListener('click', function () {
      setSaveState('сборка .html…', '');
      DG.exportHtml.run(pagesEl, lastTitle, DG.pdf.currentFormat(), setSaveState);
    });

    /* документ: восстановление из браузера или демо при первом запуске */
    var doc = DG.storage.loadDoc();
    if (doc === null) {
      src.value = DG.storage.demoMd();
      setSaveState('первый запуск — загружен пример; документы хранятся только в этом браузере', '');
    } else {
      src.value = doc.md;
      if (doc.ts) {
        setSaveState('восстановлен сохранённый документ от ' +
          new Date(doc.ts).toLocaleString('ru-RU'), 'saved');
      }
    }

    var debouncedRender = DG.util.debounce(renderNow, DG.config.renderDebounceMs);
    var debouncedSave = DG.util.debounce(function () {
      setSaveState('сохранение…', '');
      saveNow();
    }, DG.config.autosaveMs);

    src.addEventListener('input', function () {
      setSaveState('правка…', '');
      debouncedRender();
      debouncedSave();
    });
    src.addEventListener('scroll', syncScroll, { passive: true });

    /* навигация по якорям оглавления: #pN → страница N разворота */
    pagesEl.addEventListener('click', function (e) {
      var a = e.target && e.target.closest ? e.target.closest('a') : null;
      if (!a) return;
      var m = /^#p(\d+)$/.exec(a.getAttribute('href') || '');
      if (!m) return;
      e.preventDefault();
      var pg = pagesEl.querySelector('.page[data-page="' + m[1] + '"]');
      if (pg) pg.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    renderNow();
    if (doc !== null && !storageOk) saveNow();
  }

  document.addEventListener('DOMContentLoaded', init);

  return { renderNow: renderNow, saveNow: saveNow };
})();
