/* Deigracht — экспорт самодостаточного .html (export.js), волна v0.3.0
   (fp №7б — основной способ передачи документов без сервера, логика ВЛ-04).
   Результат: ОДИН файл .html со встроенными стилями и шрифтами
   (woff2 → data:URI) и снапшотом разворота; открывается двойным кликом
   без интернета и печатается в PDF (1 экранная страница = 1 печатная).

   Ограничение (техпаспорт §10): сборка идёт через fetch() своих css/woff2 —
   работает с https (Pages) и с локального сервера; при открытии редактора
   двойным кликом (file://) браузер запрещает чтение соседних файлов —
   экспорт честно сообщает об этом и предлагает запустить локальный сервер
   (python3 -m http.server). Изображений в черновике нет (до v1.0.0),
   поэтому data:URI нужны только шрифтам. */
'use strict';

DG.exportHtml = (function () {

  var CSS_FILES = ['assets/css/tokens.css', 'assets/css/theme-book.css', 'assets/css/print.css'];
  var FONTS_CSS = 'assets/css/fonts.css';

  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result).split(',')[1]); };
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }

  /* fonts.css: url('../fonts/x.woff2') → data:font/woff2;base64,... */
  async function inlineFonts(cssText, baseUrl) {
    var urls = [];
    cssText.replace(/url\('\.\.\/fonts\/([^']+)'\)/g, function (m, f) { urls.push(f); return m; });
    var out = cssText;
    for (var i = 0; i < urls.length; i++) {
      var resp = await fetch(baseUrl + 'assets/fonts/' + urls[i]);
      if (!resp.ok) throw new Error('шрифт не читается: ' + urls[i]);
      var b64 = await blobToBase64(await resp.blob());
      out = out.split("url('../fonts/" + urls[i] + "')")
               .join("url(data:font/woff2;base64," + b64 + ')');
    }
    return out;
  }

  /* минимальная раскладка превью для экспорта (дублирует 6 правил
    раскладки предпросмотра editor.css — осознанное дублирование: экспорт не тянет
     editor.css целиком) */
  var EXPORT_LAYOUT = [
    'body{margin:0;background:#6d675c;padding:26px 0 60px;}',
    '#pages{display:flex;flex-direction:column;align-items:center;gap:22px;}',
    '.page{box-shadow:0 2px 14px rgba(0,0,0,.45);}',
    '@media print{body{background:#fff;padding:0}.page{box-shadow:none;margin:0}}'
  ].join('');

  async function build(pagesEl, docTitle, format) {
    var styles = '';
    for (var i = 0; i < CSS_FILES.length; i++) {
      var r = await fetch(CSS_FILES[i]);
      if (!r.ok) throw new Error('css не читается: ' + CSS_FILES[i]);
      styles += await r.text();
    }
    var fr = await fetch(FONTS_CSS);
    if (!fr.ok) throw new Error('fonts.css не читается');
    styles = (await inlineFonts(await fr.text(), '')) + styles;

    var fmt = DG.config.formats[format] || DG.config.formats[DG.config.defaultFormat];
    var pagesHtml = pagesEl.outerHTML;

    return [
      '<!DOCTYPE html>',
      '<html lang="ru">',
      '<head>',
      '<meta charset="utf-8">',
      '<title>' + DG.util.esc(docTitle || 'Документ Deigracht') + '</title>',
      '<!-- Экспорт Deigracht ' + (window.SITE_VERSION || '') + ' · самодостаточный файл:',
      '     стили и шрифты встроены; открывается без интернета; печать = PDF -->',
      '<style>' + styles + '</style>',
      '<style>' + EXPORT_LAYOUT + '</style>',
      '<style>@page{size:' + fmt.pageCss + ';margin:0}</style>',
      '</head>',
      '<body>',
      pagesHtml,
      '</body>',
      '</html>'
    ].join('\n');
  }

  async function run(pagesEl, docTitle, format, onStatus) {
    try {
      var html = await build(pagesEl, docTitle, format);
      DG.util.download(DG.util.fileBase(docTitle) + '.html', html, 'text/html');
      if (onStatus) onStatus('самодостаточный .html скачан (' +
        Math.round(html.length / 1024) + ' КБ со шрифтами)', 'saved');
      return true;
    } catch (e) {
      if (onStatus) onStatus('экспорт .html недоступен из file:// — откройте сайт по https ' +
        'или запустите локальный сервер (python3 -m http.server): ' + e.message, 'error');
      return false;
    }
  }

  return { run: run, build: build };
})();
