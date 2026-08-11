/**
 * Auto Fit Export — Adobe Illustrator
 *
 * Batch-exports all Variable Data Sets from the active artboard.
 * Optional Auto Fit shrinks Area Type frames selected before running the script.
 *
 * How to use:
 * 1. Open the .ai file (with Variables + Data Sets)
 * 2. (Optional) Select Area Type frames to auto-fit
 * 3. File → Scripts → Other Script… → choose this file
 * 4. Pick format, folder; enable Auto Fit if frames were selected
 * 5. Export
 *
 * Output filename = Data Set name (spaces kept; rename workaround after export).
 */

#target illustrator

(function () {
  var ARTBOARD_CLIPPING = true;
  var PREFS_DIR_NAME = "auto-fit-export";
  var PREFS_FILE_NAME = "prefs.json";

  var DEFAULTS = {
    format: "PNG",
    exportFolder: "",
    jpgPpi: 300,
    jpgQuality: 100,
    pngPpi: 300,
    pngTransparency: true,
    pdfPreset: "",
    autoFit: true
  };

  var doc = null;
  var fitTargets = [];

  // -------------------------------------------------------------------------
  // Prefs
  // -------------------------------------------------------------------------

  function getPrefsFolder() {
    var folder = new Folder(Folder.userData.fsName + "/" + PREFS_DIR_NAME);
    if (!folder.exists) {
      folder.create();
    }
    return folder;
  }

  function getPrefsFile() {
    return new File(getPrefsFolder().fsName + "/" + PREFS_FILE_NAME);
  }

  function escapeJsonString(str) {
    return String(str)
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\r/g, "\\r")
      .replace(/\n/g, "\\n")
      .replace(/\t/g, "\\t");
  }

  function loadPrefs() {
    var out = {};
    var key;
    for (key in DEFAULTS) {
      if (DEFAULTS.hasOwnProperty(key)) {
        out[key] = DEFAULTS[key];
      }
    }

    var file = getPrefsFile();
    if (!file.exists) {
      return out;
    }

    try {
      file.encoding = "UTF-8";
      file.open("r");
      var raw = file.read();
      file.close();

      var parsed = parseSimpleJson(raw);
      if (parsed) {
        for (key in parsed) {
          if (parsed.hasOwnProperty(key) && DEFAULTS.hasOwnProperty(key)) {
            out[key] = parsed[key];
          }
        }
      }
    } catch (e) {}

    return out;
  }

  function savePrefs(settingsObj) {
    try {
      var file = getPrefsFile();
      file.encoding = "UTF-8";
      file.open("w");
      file.write(stringifyPrefs(settingsObj));
      file.close();
    } catch (e) {}
  }

  function stringifyPrefs(settingsObj) {
    var parts = [];
    parts.push('"format":"' + escapeJsonString(settingsObj.format) + '"');
    parts.push('"exportFolder":"' + escapeJsonString(settingsObj.exportFolder) + '"');
    parts.push('"jpgPpi":' + Number(settingsObj.jpgPpi));
    parts.push('"jpgQuality":' + Number(settingsObj.jpgQuality));
    parts.push('"pngPpi":' + Number(settingsObj.pngPpi));
    parts.push('"pngTransparency":' + (settingsObj.pngTransparency ? "true" : "false"));
    parts.push('"pdfPreset":"' + escapeJsonString(settingsObj.pdfPreset) + '"');
    parts.push('"autoFit":' + (settingsObj.autoFit ? "true" : "false"));
    return "{" + parts.join(",") + "}";
  }

  function parseSimpleJson(raw) {
    if (!raw || typeof raw !== "string") {
      return null;
    }
    raw = raw.replace(/^\s+|\s+$/g, "");
    if (raw.charAt(0) !== "{" || raw.charAt(raw.length - 1) !== "}") {
      return null;
    }

    var result = {};
    var body = raw.substring(1, raw.length - 1);
    var i = 0;
    var len = body.length;

    function skipWs() {
      while (
        i < len &&
        (body.charAt(i) === " " ||
          body.charAt(i) === "\n" ||
          body.charAt(i) === "\r" ||
          body.charAt(i) === "\t")
      ) {
        i++;
      }
    }

    function parseString() {
      if (body.charAt(i) !== '"') {
        return null;
      }
      i++;
      var outStr = "";
      while (i < len) {
        var ch = body.charAt(i);
        if (ch === "\\") {
          i++;
          if (i >= len) {
            break;
          }
          var esc = body.charAt(i);
          if (esc === "n") {
            outStr += "\n";
          } else if (esc === "r") {
            outStr += "\r";
          } else if (esc === "t") {
            outStr += "\t";
          } else {
            outStr += esc;
          }
        } else if (ch === '"') {
          i++;
          return outStr;
        } else {
          outStr += ch;
        }
        i++;
      }
      return null;
    }

    function parseValue() {
      skipWs();
      if (i >= len) {
        return null;
      }
      var ch = body.charAt(i);
      if (ch === '"') {
        return parseString();
      }
      if (body.substring(i, i + 4) === "true") {
        i += 4;
        return true;
      }
      if (body.substring(i, i + 5) === "false") {
        i += 5;
        return false;
      }
      var numStr = "";
      while (i < len) {
        var c = body.charAt(i);
        if ((c >= "0" && c <= "9") || c === "." || c === "-") {
          numStr += c;
          i++;
        } else {
          break;
        }
      }
      if (numStr.length) {
        return Number(numStr);
      }
      return null;
    }

    while (i < len) {
      skipWs();
      if (i >= len) {
        break;
      }
      var key = parseString();
      if (key === null) {
        break;
      }
      skipWs();
      if (body.charAt(i) !== ":") {
        break;
      }
      i++;
      var value = parseValue();
      if (value !== null && value !== undefined) {
        result[key] = value;
      }
      skipWs();
      if (body.charAt(i) === ",") {
        i++;
      }
    }

    return result;
  }

  // -------------------------------------------------------------------------
  // Selection snapshot (at script start)
  // -------------------------------------------------------------------------

  function isTextFrame(item) {
    try {
      return item && item.typename === "TextFrame";
    } catch (e) {
      return false;
    }
  }

  function isAreaTextFrame(item) {
    try {
      if (!isTextFrame(item)) {
        return false;
      }
      if (item.kind === TextType.AREATEXT) {
        return true;
      }
      // Some engines compare enums unreliably
      return String(item.kind).indexOf("AREATEXT") >= 0;
    } catch (e) {
      return false;
    }
  }

  function collectAreaFramesFromItem(item, out) {
    if (!item) {
      return;
    }
    try {
      if (isAreaTextFrame(item)) {
        out.push(item);
        return;
      }
      if (item.typename === "GroupItem" && item.pageItems && item.pageItems.length) {
        var g;
        for (g = 0; g < item.pageItems.length; g++) {
          collectAreaFramesFromItem(item.pageItems[g], out);
        }
      }
    } catch (e) {}
  }

  /**
   * Capture Area Type targets from the current selection BEFORE the dialog opens.
   * Stores markerName + design maxFontSize (same approach as the original script).
   */
  function snapshotFitTargets(document) {
    var frames = [];
    var sel = null;
    var i;

    try {
      sel = document.selection;
    } catch (eSel) {
      sel = app.selection;
    }

    if (sel && sel.length) {
      for (i = 0; i < sel.length; i++) {
        collectAreaFramesFromItem(sel[i], frames);
      }
    }

    // Deduplicate by object reference
    var unique = [];
    var u;
    var v;
    var dup;
    for (u = 0; u < frames.length; u++) {
      dup = false;
      for (v = 0; v < unique.length; v++) {
        if (unique[v] === frames[u]) {
          dup = true;
          break;
        }
      }
      if (!dup) {
        unique.push(frames[u]);
      }
    }
    frames = unique;

    var targets = [];
    var usedMarkers = {};
    var stamp = new Date().getTime();

    for (i = 0; i < frames.length; i++) {
      var frame = frames[i];
      var markerName = frame.name;

      // Ensure a stable, unique name so we can find the frame after Data Set display()
      if (
        !markerName ||
        markerName === "<Text>" ||
        usedMarkers[markerName]
      ) {
        markerName = "__af_export_" + stamp + "_" + i + "__";
        try {
          frame.name = markerName;
        } catch (eName) {
          continue;
        }
      }
      usedMarkers[markerName] = true;

      var maxFontSize = getFontSize(frame);
      if (!maxFontSize || maxFontSize <= 0) {
        try {
          if (frame.characters && frame.characters.length > 0) {
            maxFontSize = frame.characters[0].characterAttributes.size;
          }
        } catch (eChar) {}
      }
      if (!maxFontSize || maxFontSize <= 0) {
        continue;
      }

      targets.push({
        markerName: markerName,
        maxFontSize: maxFontSize
      });
    }

    return targets;
  }

  // -------------------------------------------------------------------------
  // Dialog
  // -------------------------------------------------------------------------

  function getPdfPresetNames() {
    var names = [];
    try {
      var list = app.PDFPresetsList;
      if (list && list.length) {
        var i;
        for (i = 0; i < list.length; i++) {
          names.push(String(list[i]));
        }
      }
    } catch (e) {}
    return names;
  }

  function pickDefaultPdfPreset(names, savedName) {
    var i;
    var p;
    if (savedName) {
      for (i = 0; i < names.length; i++) {
        if (names[i] === savedName) {
          return savedName;
        }
      }
    }
    var preferred = ["[Press Quality]", "[High Quality Print]", "[Illustrator Default]"];
    for (p = 0; p < preferred.length; p++) {
      for (i = 0; i < names.length; i++) {
        if (names[i] === preferred[p]) {
          return preferred[p];
        }
      }
    }
    return names.length ? names[0] : "";
  }

  function clampInt(value, min, max, fallback) {
    var n = parseInt(value, 10);
    if (isNaN(n)) {
      return fallback;
    }
    if (n < min) {
      return min;
    }
    if (n > max) {
      return max;
    }
    return n;
  }

  function getActiveArtboardIndex1Based(document) {
    try {
      return document.artboards.getActiveArtboardIndex() + 1;
    } catch (e) {
      return 1;
    }
  }

  function showDialog(savedPrefs, areaCount) {
    var pdfPresets = getPdfPresetNames();
    var defaultPdf = pickDefaultPdfPreset(pdfPresets, savedPrefs.pdfPreset);
    var canAutoFit = areaCount > 0;

    var w = new Window("dialog", "Auto Fit Export");
    w.orientation = "column";
    w.alignChildren = ["fill", "top"];
    w.spacing = 10;
    w.margins = 16;

    var formatGroup = w.add("panel", undefined, "Format");
    formatGroup.orientation = "row";
    formatGroup.alignChildren = ["left", "center"];
    formatGroup.margins = 12;
    var radioJpg = formatGroup.add("radiobutton", undefined, "JPG");
    var radioPng = formatGroup.add("radiobutton", undefined, "PNG");
    var radioPdf = formatGroup.add("radiobutton", undefined, "PDF");

    if (savedPrefs.format === "JPG") {
      radioJpg.value = true;
    } else if (savedPrefs.format === "PDF") {
      radioPdf.value = true;
    } else {
      radioPng.value = true;
    }

    var folderGroup = w.add("panel", undefined, "Export folder");
    folderGroup.orientation = "row";
    folderGroup.alignChildren = ["fill", "center"];
    folderGroup.margins = 12;
    var folderInput = folderGroup.add("edittext", undefined, "");
    folderInput.preferredSize = [320, 24];
    var browseBtn = folderGroup.add("button", undefined, "Browse…");

    if (savedPrefs.exportFolder) {
      var savedFolder = new Folder(savedPrefs.exportFolder);
      if (savedFolder.exists) {
        folderInput.text = savedFolder.fsName;
      }
    }

    browseBtn.onClick = function () {
      var start = folderInput.text ? new Folder(folderInput.text) : Folder.desktop;
      var picked = start.selectDlg("Select export folder");
      if (picked) {
        folderInput.text = picked.fsName;
      }
    };

    var settingsPanel = w.add("panel", undefined, "Settings");
    settingsPanel.orientation = "stack";
    settingsPanel.alignChildren = ["fill", "top"];
    settingsPanel.margins = 12;
    settingsPanel.preferredSize = [380, 90];

    var jpgPanel = settingsPanel.add("group");
    jpgPanel.orientation = "column";
    jpgPanel.alignChildren = ["left", "center"];
    var jpgRow1 = jpgPanel.add("group");
    jpgRow1.add("statictext", undefined, "PPI:");
    var jpgPpiInput = jpgRow1.add("edittext", undefined, String(savedPrefs.jpgPpi || 300));
    jpgPpiInput.characters = 6;
    var jpgRow2 = jpgPanel.add("group");
    jpgRow2.add("statictext", undefined, "Quality (0–100):");
    var jpgQualityInput = jpgRow2.add(
      "edittext",
      undefined,
      String(savedPrefs.jpgQuality != null ? savedPrefs.jpgQuality : 100)
    );
    jpgQualityInput.characters = 6;

    var pngPanel = settingsPanel.add("group");
    pngPanel.orientation = "column";
    pngPanel.alignChildren = ["left", "center"];
    var pngRow1 = pngPanel.add("group");
    pngRow1.add("statictext", undefined, "PPI:");
    var pngPpiInput = pngRow1.add("edittext", undefined, String(savedPrefs.pngPpi || 300));
    pngPpiInput.characters = 6;
    var pngTransparency = pngPanel.add("checkbox", undefined, "Transparency");
    pngTransparency.value = savedPrefs.pngTransparency !== false;

    var pdfPanel = settingsPanel.add("group");
    pdfPanel.orientation = "column";
    pdfPanel.alignChildren = ["fill", "center"];
    var pdfRow = pdfPanel.add("group");
    pdfRow.orientation = "row";
    pdfRow.alignChildren = ["left", "center"];
    pdfRow.add("statictext", undefined, "PDF Preset:");
    var pdfPresetDropdown = pdfRow.add(
      "dropdownlist",
      undefined,
      pdfPresets.length ? pdfPresets : ["(no presets)"]
    );
    pdfPresetDropdown.preferredSize = [240, 24];
    if (pdfPresets.length) {
      var di;
      for (di = 0; di < pdfPresetDropdown.items.length; di++) {
        if (pdfPresetDropdown.items[di].text === defaultPdf) {
          pdfPresetDropdown.selection = di;
          break;
        }
      }
      if (!pdfPresetDropdown.selection) {
        pdfPresetDropdown.selection = 0;
      }
    } else {
      pdfPresetDropdown.selection = 0;
      pdfPresetDropdown.enabled = false;
    }

    function updatePanels() {
      jpgPanel.visible = radioJpg.value;
      pngPanel.visible = radioPng.value;
      pdfPanel.visible = radioPdf.value;
    }

    radioJpg.onClick = updatePanels;
    radioPng.onClick = updatePanels;
    radioPdf.onClick = updatePanels;
    updatePanels();

    var autoFitPanel = w.add("panel", undefined, "Auto Fit");
    autoFitPanel.orientation = "column";
    autoFitPanel.alignChildren = ["left", "center"];
    autoFitPanel.margins = 12;

    autoFitPanel.add(
      "statictext",
      undefined,
      "Area Type selected: " + areaCount
    );

    var autoFitCb = autoFitPanel.add(
      "checkbox",
      undefined,
      "Auto Fit selected Area Type frames"
    );

    if (canAutoFit) {
      autoFitCb.enabled = true;
      // Always default ON when frames were selected (ignore stale prefs:false)
      autoFitCb.value = true;
    } else {
      autoFitCb.enabled = false;
      autoFitCb.value = false;
    }

    var hint = autoFitPanel.add(
      "statictext",
      undefined,
      canAutoFit
        ? "Using the selection made before running this script."
        : "Select Area Type frames first, then run the script again to enable Auto Fit."
    );
    try {
      hint.graphics.font = ScriptUI.newFont(
        hint.graphics.font.name,
        ScriptUI.FontStyle.ITALIC,
        10
      );
    } catch (eHint) {}

    var info = w.add(
      "statictext",
      undefined,
      "Data Sets: " + doc.dataSets.length + "  |  Active artboard only  |  Clip to artboard"
    );
    try {
      info.graphics.font = ScriptUI.newFont(
        info.graphics.font.name,
        ScriptUI.FontStyle.ITALIC,
        10
      );
    } catch (eFont) {}

    var btnGroup = w.add("group");
    btnGroup.alignment = "right";
    var cancelBtn = btnGroup.add("button", undefined, "Cancel", { name: "cancel" });
    var exportBtn = btnGroup.add("button", undefined, "Export", { name: "ok" });

    // Capture UI values on Export click — more reliable than reading after close
    var result = null;

    exportBtn.onClick = function () {
      var format = "PNG";
      if (radioJpg.value) {
        format = "JPG";
      } else if (radioPdf.value) {
        format = "PDF";
      }

      var folderPath = folderInput.text.replace(/^\s+|\s+$/g, "");
      if (!folderPath) {
        alert("Please select an export folder first.");
        return;
      }

      var outFolder = new Folder(folderPath);
      if (!outFolder.exists) {
        alert("Export folder not found:\n" + folderPath);
        return;
      }

      var pdfPreset =
        pdfPresets.length && pdfPresetDropdown.selection
          ? pdfPresetDropdown.selection.text
          : "";

      if (format === "PDF" && !pdfPreset) {
        alert("No PDF Preset is available in Illustrator.");
        return;
      }

      result = {
        format: format,
        exportFolder: outFolder.fsName,
        jpgPpi: clampInt(jpgPpiInput.text, 72, 2400, 300),
        jpgQuality: clampInt(jpgQualityInput.text, 0, 100, 100),
        pngPpi: clampInt(pngPpiInput.text, 72, 2400, 300),
        pngTransparency: !!pngTransparency.value,
        pdfPreset: pdfPreset,
        autoFit: canAutoFit && !!autoFitCb.value
      };

      w.close(1);
    };

    cancelBtn.onClick = function () {
      w.close(2);
    };

    if (w.show() !== 1 || !result) {
      return null;
    }

    return result;
  }

  // -------------------------------------------------------------------------
  // Export
  // -------------------------------------------------------------------------

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

    if (!tempFile.exists) {
      tempFile = new File(folder.fsName + "/" + tempName);
    }

    if (tempFile.exists) {
      tempFile.rename(finalName);
    }
  }

  function exportJpg(document, folder, baseName, ppi, quality) {
    var scale = (ppi / 72) * 100;
    var opts = new ExportOptionsJPEG();
    opts.antiAliasing = true;
    opts.qualitySetting = quality;
    opts.horizontalScale = scale;
    opts.verticalScale = scale;
    opts.optimization = true;
    opts.artBoardClipping = ARTBOARD_CLIPPING;

    exportWithFinalName(folder, baseName, "jpg", function (tempFile) {
      document.exportFile(tempFile, ExportType.JPEG, opts);
    });
  }

  function exportPng(document, folder, baseName, ppi, transparency) {
    var scale = (ppi / 72) * 100;
    var pngOpts = new ExportOptionsPNG24();
    pngOpts.antiAliasing = true;
    pngOpts.transparency = transparency;
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
        opts.transparency = transparency;
        opts.matte = !transparency;
        document.imageCapture(tempFile, rect, opts);
      }
    });
  }

  function exportPdfViaDuplicate(sourceDoc, file, pdfPresetName, artboardIndex1Based) {
    var duplicate = sourceDoc.duplicate();
    try {
      try {
        duplicate.artboards.setActiveArtboardIndex(artboardIndex1Based - 1);
      } catch (e1) {}

      var pdfOptions = new PDFSaveOptions();
      pdfOptions.pDFPreset = pdfPresetName;
      try {
        pdfOptions.artboardRange = String(artboardIndex1Based);
      } catch (e2) {}

      duplicate.saveAs(file, pdfOptions);
    } finally {
      try {
        duplicate.close(SaveOptions.DONOTSAVECHANGES);
      } catch (e3) {}
    }
  }

  function runExport(settings, targets) {
    var activeDoc = app.activeDocument;
    var outFolder = new Folder(settings.exportFolder);
    var total = activeDoc.dataSets.length;
    var success = 0;
    var failed = [];
    var usedNames = {};
    var doFit = settings.autoFit && targets && targets.length > 0;

    var previousActiveIndex = -1;
    try {
      var ai;
      for (ai = 0; ai < activeDoc.dataSets.length; ai++) {
        if (activeDoc.activeDataSet && activeDoc.dataSets[ai] === activeDoc.activeDataSet) {
          previousActiveIndex = ai;
          break;
        }
      }
    } catch (e) {
      previousActiveIndex = -1;
    }

    var activeAb = getActiveArtboardIndex1Based(activeDoc);
    var i;
    var t;

    for (i = 0; i < total; i++) {
      var dataSet = activeDoc.dataSets[i];
      var baseName = sanitizeFileName(dataSet.name) || "export_" + (i + 1);
      baseName = uniqueBaseName(baseName, usedNames);

      try {
        dataSet.display();
        app.redraw();

        if (doFit) {
          for (t = 0; t < targets.length; t++) {
            var frame = findTextFrameByName(activeDoc, targets[t].markerName);
            if (!frame) {
              throw new Error("Target text frame missing: " + targets[t].markerName);
            }
            fitTextToFrame(frame, targets[t].maxFontSize);
          }
          app.redraw();
        }

        if (settings.format === "JPG") {
          exportJpg(
            activeDoc,
            outFolder,
            baseName,
            settings.jpgPpi,
            settings.jpgQuality
          );
        } else if (settings.format === "PNG") {
          exportPng(
            activeDoc,
            outFolder,
            baseName,
            settings.pngPpi,
            settings.pngTransparency
          );
        } else {
          exportWithFinalName(outFolder, baseName, "pdf", function (tempFile) {
            exportPdfViaDuplicate(
              activeDoc,
              tempFile,
              settings.pdfPreset,
              activeAb
            );
          });
        }

        success++;
      } catch (err) {
        failed.push(dataSet.name + ": " + err);
      }
    }

    if (doFit) {
      for (t = 0; t < targets.length; t++) {
        var restoreFrame = findTextFrameByName(activeDoc, targets[t].markerName);
        if (restoreFrame) {
          setFontSize(restoreFrame, targets[t].maxFontSize);
        }
      }
    }

    if (previousActiveIndex >= 0 && previousActiveIndex < activeDoc.dataSets.length) {
      try {
        activeDoc.dataSets[previousActiveIndex].display();
        app.redraw();
      } catch (eRestore) {}
    }

    savePrefs(settings);

    var msg = "Done.\n\nSucceeded: " + success + " / " + total;
    if (doFit) {
      msg += "\nAuto Fit frames: " + targets.length;
    } else {
      msg += "\nAuto Fit: off";
    }
    msg += "\nFormat: " + settings.format;
    if (settings.format === "JPG") {
      msg += "\nPPI: " + settings.jpgPpi;
    } else if (settings.format === "PNG") {
      msg += "\nPPI: " + settings.pngPpi;
    }
    if (failed.length) {
      msg += "\nFailed: " + failed.length + "\n\n" + failed.slice(0, 8).join("\n");
      if (failed.length > 8) {
        msg += "\n…";
      }
    }
    msg += "\n\nFolder:\n" + outFolder.fsName;
    alert(msg);
  }

  // -------------------------------------------------------------------------
  // Fit helpers
  // -------------------------------------------------------------------------

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
    var b = textFrame.geometricBounds;
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
        } catch (convErr) {}
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

  function textDoesNotFit(textFrame, fast) {
    var content = normalizeText(textFrame.contents);
    if (!content.length) {
      return false;
    }

    if (hasClippedOrWrapped(textFrame)) {
      return true;
    }

    if (fast) {
      return false;
    }

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
    if (!textDoesNotFit(textFrame, false)) {
      return hi;
    }

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

    best = shrinkUntilFits(textFrame, best, 0.25, 40, true);
    best = shrinkUntilFits(textFrame, best, 0.1, 20, true);

    setFontSize(textFrame, best);
    app.redraw();

    best = shrinkUntilFits(textFrame, best, 0.1, 30, false);

    setFontSize(textFrame, best);
    app.redraw();

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

  // -------------------------------------------------------------------------
  // Main (after all function declarations — safer in ExtendScript)
  // -------------------------------------------------------------------------

  if (app.documents.length === 0) {
    alert("No document is open.");
    return;
  }

  doc = app.activeDocument;

  if (!doc.dataSets || doc.dataSets.length === 0) {
    alert("This document has no Data Sets.\nImport Variables + Data Sets first.");
    return;
  }

  // Snapshot selection NOW (before any dialog steals focus)
  fitTargets = snapshotFitTargets(doc);

  var prefs = loadPrefs();
  var settings = showDialog(prefs, fitTargets.length);
  if (!settings) {
    return;
  }

  if (settings.autoFit && fitTargets.length === 0) {
    alert(
      "Auto Fit was requested, but no Area Type frames were captured.\n" +
        "Select Area Type frames (not Point Type) with the Selection tool, then run the script again."
    );
    return;
  }

  runExport(settings, settings.autoFit ? fitTargets : []);
})();
