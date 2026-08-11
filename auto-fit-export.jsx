/**
 * Auto Fit Export — Adobe Illustrator
 *
 * Requirements:
 * - The .ai file already has Variables + Data Sets
 * - Target text frames are Area Type (not Point Type)
 * - Select one or more text frames BEFORE running the script
 *
 * How to use:
 * 1. Open the .ai file
 * 2. Select one or more Area Type frames to auto-fit
 * 3. File → Scripts → Other Script… → choose this file
 * 4. Pick format (PDF / PNG / JPG), PPI, and output folder
 *
 * Output filename = Data Set name (spaces kept; rename workaround after export).
 *
 * Notes:
 * - JPG/PNG: PPI via scale (100% = 72ppi); PNG falls back to ImageCapture if needed
 * - PDF: vector; PPI is unused
 * - maxFontSize per text frame = font size when the script starts
 */

#target illustrator

(function () {
  var JPG_QUALITY = 100;
  var ARTBOARD_CLIPPING = true;

  if (app.documents.length === 0) {
    alert("No document is open.");
    return;
  }

  var doc = app.activeDocument;

  if (!doc.dataSets || doc.dataSets.length === 0) {
    alert("This document has no Data Sets.\nImport Variables + Data Sets first.");
    return;
  }

  var sel = app.selection;
  if (!sel || sel.length < 1) {
    alert("Select at least 1 Area Type before running the script.");
    return;
  }

  var targets = [];
  for (var s = 0; s < sel.length; s++) {
    var selected = sel[s];
    if (!isTextFrame(selected) || selected.kind !== TextType.AREATEXT) {
      continue;
    }

    var markerName = selected.name;
    if (!markerName || markerName === "<Text>") {
      markerName = "__export_target_" + s + "__";
      selected.name = markerName;
    }

    var maxFontSize = getFontSize(selected);
    if (!maxFontSize || maxFontSize <= 0) {
      alert(
        "Could not read the text frame font size.\nReselect the Area Type frames, then run the script again."
      );
      return;
    }

    targets.push({
      markerName: markerName,
      maxFontSize: maxFontSize
    });
  }

  if (targets.length === 0) {
    alert(
      "No Area Type frames in the selection.\nSelect one or more Area Type frames (not Point Type)."
    );
    return;
  }

  var exportOpts = showExportDialog();
  if (!exportOpts) {
    return;
  }

  if (exportOpts.pdf && (!doc.fullName || !doc.saved)) {
    alert("To export PDF, save the .ai file first (File → Save).");
    return;
  }

  var outFolder = Folder.selectDialog("Choose output folder");
  if (!outFolder) {
    return;
  }

  var sourceAiFile = null;
  try {
    if (doc.fullName) {
      sourceAiFile = doc.fullName;
    }
  } catch (e) {}

  var scalePct = (exportOpts.ppi / 72) * 100;
  var exported = 0;
  var usedNames = {};

  for (var i = 0; i < doc.dataSets.length; i++) {
    var ds = doc.dataSets[i];
    ds.display();
    app.redraw();

    for (var t = 0; t < targets.length; t++) {
      var frame = findTextFrameByName(doc, targets[t].markerName);
      if (!frame) {
        alert(
          "Target text frame missing after displaying Data Set:\n" +
            ds.name +
            "\n(" +
            targets[t].markerName +
            ")"
        );
        return;
      }
      fitTextToFrame(frame, targets[t].maxFontSize);
    }

    var baseName = sanitizeFileName(ds.name) || "export_" + (i + 1);
    baseName = uniqueBaseName(baseName, usedNames);

    if (exportOpts.jpg) {
      exportJpg(doc, outFolder, baseName, scalePct);
      exported++;
    }
    if (exportOpts.png) {
      exportPng(doc, outFolder, baseName, exportOpts.ppi);
      exported++;
    }
    if (exportOpts.pdf) {
      exportPdf(doc, outFolder, baseName);
      exported++;
    }
  }

  // Restore each target to its original design font size
  for (var r = 0; r < targets.length; r++) {
    var restoreFrame = findTextFrameByName(doc, targets[r].markerName);
    if (restoreFrame) {
      setFontSize(restoreFrame, targets[r].maxFontSize);
    }
  }

  // After PDF saveAs, the document may become a .pdf — reopen the original .ai
  if (exportOpts.pdf && sourceAiFile && sourceAiFile.exists) {
    try {
      if (!doc.fullName || String(doc.fullName.fsName) !== String(sourceAiFile.fsName)) {
        doc.close(SaveOptions.DONOTSAVECHANGES);
        app.open(sourceAiFile);
      }
    } catch (reopenErr) {}
  }

  var formats = [];
  if (exportOpts.jpg) formats.push("JPG");
  if (exportOpts.png) formats.push("PNG");
  if (exportOpts.pdf) formats.push("PDF");

  alert(
    "Done.\nFiles: " +
      doc.dataSets.length +
      " dataset(s)\nText frames: " +
      targets.length +
      "\nFormat: " +
      formats.join(", ") +
      (exportOpts.jpg || exportOpts.png
        ? "\nPPI: " + exportOpts.ppi
        : "") +
      "\nFolder: " +
      outFolder.fsName
  );

  // --- Dialog ---

  function showExportDialog() {
    var w = new Window("dialog", "Auto Fit Export");
    w.orientation = "column";
    w.alignChildren = ["fill", "top"];
    w.margins = 16;
    w.spacing = 12;

    w.add("statictext", undefined, "Export format:");

    var formatGroup = w.add("group");
    formatGroup.orientation = "row";
    formatGroup.alignChildren = ["left", "center"];
    var cbJpg = formatGroup.add("checkbox", undefined, "JPG");
    var cbPng = formatGroup.add("checkbox", undefined, "PNG");
    var cbPdf = formatGroup.add("checkbox", undefined, "PDF");
    cbJpg.value = true;

    var ppiPanel = w.add("group");
    ppiPanel.orientation = "row";
    ppiPanel.alignChildren = ["left", "center"];
    ppiPanel.add("statictext", undefined, "PPI (JPG/PNG):");
    var ppiInput = ppiPanel.add("edittext", undefined, "300");
    ppiInput.characters = 6;

    function syncPpiEnabled() {
      ppiPanel.enabled = cbJpg.value || cbPng.value;
    }
    cbJpg.onClick = syncPpiEnabled;
    cbPng.onClick = syncPpiEnabled;
    cbPdf.onClick = syncPpiEnabled;
    syncPpiEnabled();

    var btns = w.add("group");
    btns.alignment = "center";
    btns.add("button", undefined, "OK", { name: "ok" });
    btns.add("button", undefined, "Cancel", { name: "cancel" });

    if (w.show() !== 1) {
      return null;
    }

    if (!cbJpg.value && !cbPng.value && !cbPdf.value) {
      alert("Select at least 1 format.");
      return showExportDialog();
    }

    var ppi = parseFloat(ppiInput.text);
    if (isNaN(ppi) || ppi <= 0) {
      ppi = 300;
    }

    return {
      jpg: cbJpg.value,
      png: cbPng.value,
      pdf: cbPdf.value,
      ppi: ppi
    };
  }

  // --- Export ---

  /**
   * Illustrator often turns spaces in filenames into "-" on export/save.
   * Workaround: write a temp file (no spaces), then rename to the Data Set name.
   */
  function exportWithFinalName(folder, baseName, ext, writer) {
    var finalName = baseName + "." + ext;
    var tempName = "__ai_export_tmp__." + ext;
    var tempFile = new File(folder.fsName + "/" + tempName);
    var finalFile = new File(folder.fsName + "/" + finalName);

    if (tempFile.exists) {
      tempFile.remove();
    }
    if (finalFile.exists) {
      finalFile.remove();
    }

    writer(tempFile);

    // AI sometimes writes a slightly different name; ensure temp exists
    if (!tempFile.exists) {
      tempFile = new File(folder.fsName + "/" + tempName);
    }

    if (tempFile.exists) {
      if (!tempFile.rename(finalName)) {
        // rename failed: keep temp (better to have a file than lose it)
      }
    }
  }

  function exportJpg(document, folder, baseName, scale) {
    var opts = new ExportOptionsJPEG();
    opts.antiAliasing = true;
    opts.qualitySetting = JPG_QUALITY;
    opts.horizontalScale = scale;
    opts.verticalScale = scale;
    opts.optimization = true;
    opts.artBoardClipping = ARTBOARD_CLIPPING;

    exportWithFinalName(folder, baseName, "jpg", function (tempFile) {
      document.exportFile(tempFile, ExportType.JPEG, opts);
    });
  }

  function exportPng(document, folder, baseName, ppi) {
    var scale = (ppi / 72) * 100;
    var pngOpts = new ExportOptionsPNG24();
    pngOpts.antiAliasing = true;
    pngOpts.transparency = false;
    pngOpts.artBoardClipping = ARTBOARD_CLIPPING;
    pngOpts.horizontalScale = scale;
    pngOpts.verticalScale = scale;

    exportWithFinalName(folder, baseName, "png", function (tempFile) {
      try {
        document.exportFile(tempFile, ExportType.PNG24, pngOpts);
      } catch (exportErr) {
        var abIndex = document.artboards.getActiveArtboardIndex();
        var rect = document.artboards[abIndex].artboardRect;
        var opts = new ImageCaptureOptions();
        opts.resolution = ppi;
        opts.antiAliasing = true;
        opts.transparency = false;
        opts.matte = true;
        document.imageCapture(tempFile, rect, opts);
      }
    });
  }

  function exportPdf(document, folder, baseName) {
    var opts = new PDFSaveOptions();
    opts.compatibility = PDFCompatibility.ACROBAT5;
    opts.preserveEditability = false;
    opts.generateThumbnails = true;
    opts.optimization = true;

    exportWithFinalName(folder, baseName, "pdf", function (tempFile) {
      document.saveAs(tempFile, opts);
    });
  }

  // --- Helpers ---

  function isTextFrame(item) {
    try {
      return item && item.typename === "TextFrame";
    } catch (e) {
      return false;
    }
  }

  function findTextFrameByName(document, name) {
    var frames = document.textFrames;
    for (var f = 0; f < frames.length; f++) {
      if (frames[f].name === name) {
        return frames[f];
      }
    }
    return null;
  }

  function getFontSize(textFrame) {
    try {
      return textFrame.textRange.characterAttributes.size;
    } catch (e) {
      return 0;
    }
  }

  function setFontSize(textFrame, size) {
    try {
      textFrame.textRange.characterAttributes.size = size;
      return;
    } catch (e0) {}

    // Fallback only if whole-range set failed
    try {
      var chars = textFrame.characters;
      var n = chars.length;
      for (var c = 0; c < n; c++) {
        try {
          chars[c].characterAttributes.size = size;
        } catch (e2) {}
      }
    } catch (e1) {}
  }

  function disableHyphenation(textFrame) {
    try {
      var paras = textFrame.paragraphs;
      for (var p = 0; p < paras.length; p++) {
        paras[p].paragraphAttributes.hyphenation = false;
      }
    } catch (e) {}
  }

  function normalizeText(s) {
    return String(s || "")
      .replace(/[\r\n\u2028\u2029]+/g, "")
      .replace(/\s+/g, " ")
      .replace(/^\s+|\s+$/g, "");
  }

  function getEffectiveFrameWidth(textFrame) {
    var b = textFrame.geometricBounds; // [L, T, R, B]
    var w = b[2] - b[0];
    try {
      var pa = textFrame.paragraphs[0].paragraphAttributes;
      w -= Number(pa.leftIndent) || 0;
      w -= Number(pa.rightIndent) || 0;
      var first = Number(pa.firstLineIndent) || 0;
      if (first > 0) {
        w -= first;
      }
    } catch (e) {}
    return w;
  }

  /**
   * True if area text wraps past 1 line or characters are clipped (overflow).
   * Important for punctuation cases: "..., Sp.O.T." often clips even when
   * width measurement looks loose.
   */
  function hasClippedOrWrapped(textFrame) {
    var full = normalizeText(textFrame.contents);
    if (!full.length) {
      return false;
    }

    var lineCount = 0;
    try {
      lineCount = textFrame.lines.length;
    } catch (e) {
      return true;
    }

    if (lineCount !== 1) {
      return true;
    }

    var visible = normalizeText(textFrame.lines[0].contents);
    if (visible.length < full.length) {
      return true;
    }
    if (visible !== full) {
      return true;
    }

    try {
      var lineCharCount = textFrame.lines[0].characters.length;
      var totalCharCount = textFrame.characters.length;
      // trailing hard return in area text is not counted as content
      var raw = String(textFrame.contents || "").replace(/\r+$/, "");
      if (lineCharCount < raw.length || lineCharCount < totalCharCount - 1) {
        if (normalizeText(textFrame.lines[0].contents) !== full) {
          return true;
        }
      }
      if (lineCharCount < raw.length && visible.length < full.length) {
        return true;
      }
    } catch (e2) {}

    return false;
  }

  /**
   * Measure rendered single-line width. Prefer duplicate + convert to point text
   * so font/kerning match the original frame.
   */
  function measureTextWidth(textFrame) {
    var content = normalizeText(textFrame.contents);
    if (!content.length) {
      return 0;
    }

    var dup = null;
    try {
      dup = textFrame.duplicate();
      dup.name = "__fit_measure_tmp__";
      try {
        dup.translate(20000, 20000);
      } catch (eMove) {
        dup.left = 20000;
        dup.top = 20000;
      }

      if (dup.kind === TextType.AREATEXT) {
        try {
          dup.convertAreaObjectToPointObject();
        } catch (convErr) {
          // fallback below if convert is unavailable
        }
      }

      if (normalizeText(dup.contents) !== content || dup.kind === TextType.AREATEXT) {
        var size = getFontSize(textFrame);
        var src = textFrame.textRange.characterAttributes;
        if (dup.kind === TextType.AREATEXT) {
          dup.remove();
          dup = app.activeDocument.textFrames.add();
          dup.name = "__fit_measure_tmp__";
          dup.left = 20000;
          dup.top = 20000;
        }
        dup.contents = content;
        try {
          dup.textRange.characterAttributes.textFont = src.textFont;
        } catch (e1) {}
        setFontSize(dup, size);
        try {
          dup.textRange.characterAttributes.horizontalScale = src.horizontalScale;
        } catch (e3) {}
        try {
          dup.textRange.characterAttributes.tracking = src.tracking;
        } catch (e4) {}
      }

      disableHyphenation(dup);

      var b = dup.geometricBounds;
      var w = b[2] - b[0];
      dup.remove();
      dup = null;
      return w;
    } catch (err) {
      if (dup) {
        try {
          dup.remove();
        } catch (e6) {}
      }
      return -1;
    }
  }

  /**
   * @param {boolean} fast  If true, only clip/wrap check (no duplicate measure).
   */
  function textDoesNotFit(textFrame, fast) {
    var content = normalizeText(textFrame.contents);
    if (!content.length) {
      return false;
    }

    // 1) real area-text state (wrap / clipped)
    if (hasClippedOrWrapped(textFrame)) {
      return true;
    }

    if (fast) {
      return false;
    }

    // 2) full single-line width vs effective frame width (with safety margin)
    var textW = measureTextWidth(textFrame);
    var frameW = getEffectiveFrameWidth(textFrame);
    if (textW < 0) {
      return hasClippedOrWrapped(textFrame);
    }

    var safety = Math.max(2.5, frameW * 0.02);
    return textW > frameW - safety;
  }

  function shrinkUntilFits(textFrame, best, step, maxSteps, fast) {
    var guard = 0;
    while (textDoesNotFit(textFrame, fast) && best > 0.1 && guard < maxSteps) {
      best -= step;
      if (best < 0.1) {
        best = 0.1;
      }
      setFontSize(textFrame, best);
      guard++;
    }
    return best;
  }

  function fitTextToFrame(textFrame, maxSize) {
    disableHyphenation(textFrame);

    var hi = maxSize;
    var lo = 0.1;
    var best = -1;

    setFontSize(textFrame, hi);
    app.redraw();
    // Full check once: if already fits at design size, skip search
    if (!textDoesNotFit(textFrame, false)) {
      return hi;
    }

    // Binary search with fast clip/wrap only (no measureTextWidth)
    for (var iter = 0; iter < 16; iter++) {
      var mid = (lo + hi) / 2;
      setFontSize(textFrame, mid);

      if (!textDoesNotFit(textFrame, true)) {
        best = mid;
        lo = mid;
      } else {
        hi = mid;
      }
    }

    if (best < 0) {
      best = Math.max(lo, 0.1);
    }

    setFontSize(textFrame, best);
    app.redraw();

    // Coarse then fine guard (clip/wrap only)
    best = shrinkUntilFits(textFrame, best, 0.25, 40, true);
    best = shrinkUntilFits(textFrame, best, 0.1, 20, true);

    setFontSize(textFrame, best);
    app.redraw();

    // Final verify with width measure (punctuation / tight fit cases)
    best = shrinkUntilFits(textFrame, best, 0.1, 30, false);

    setFontSize(textFrame, best);
    app.redraw();

    // small extra shrink so text is not flush against the edge
    if (!textDoesNotFit(textFrame, false) && best > 0.2) {
      best -= 0.2;
      setFontSize(textFrame, best);
      app.redraw();
      if (textDoesNotFit(textFrame, false)) {
        best += 0.2;
        setFontSize(textFrame, best);
        app.redraw();
      }
    }

    return best;
  }

  function sanitizeFileName(name) {
    var s = String(name || "");
    // Keep spaces; strip only illegal filename characters
    s = s.replace(/[\r\n\t]+/g, " ");
    s = s.replace(/[\/\\:\*\?"<>\|]/g, "");
    s = s.replace(/\s+/g, " ");
    s = s.replace(/^\s+|\s+$/g, "");
    return s;
  }

  function uniqueBaseName(baseName, used) {
    var key = baseName.toLowerCase();
    if (!used[key]) {
      used[key] = 1;
      return baseName;
    }
    used[key]++;
    return baseName + "_" + used[key];
  }
})();
