(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.PapyrusComicRuntime = Object.assign(
      factory(),
      root.PapyrusComicRuntime || {}
    );
  }
})(typeof self === "object" ? self : this, function () {
  var IMAGE_EXTENSIONS = /\.(?:gif|jpe?g|png|svg|webp)$/i;

  function isComicImageName(name) {
    return typeof name === "string" && IMAGE_EXTENSIONS.test(name);
  }

  function naturalCompare(left, right) {
    var leftParts = String(left).split(/(\d+)/);
    var rightParts = String(right).split(/(\d+)/);
    var length = Math.max(leftParts.length, rightParts.length);

    for (var index = 0; index < length; index += 1) {
      var leftPart = leftParts[index] || "";
      var rightPart = rightParts[index] || "";
      if (leftPart === rightPart) continue;

      var leftNumber = /^\d+$/.test(leftPart) ? Number(leftPart) : null;
      var rightNumber = /^\d+$/.test(rightPart) ? Number(rightPart) : null;
      if (leftNumber !== null && rightNumber !== null) {
        return leftNumber - rightNumber;
      }
      return leftPart.localeCompare(rightPart, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    }

    return 0;
  }

  function sortComicPageNames(names) {
    return names.slice().sort(naturalCompare);
  }

  function patchCbrWorkerSource(workerSource, wasmUrl) {
    return workerSource.replace(
      /new URL\("libarchive\.wasm",import\.meta\.url\)\.href/g,
      JSON.stringify(wasmUrl)
    );
  }

  function getComicPreviewSize(width, height, maxWidth, maxHeight) {
    var safeWidth = Math.max(1, Number(width) || 1);
    var safeHeight = Math.max(1, Number(height) || 1);
    var widthLimit = maxWidth || 240;
    var heightLimit = maxHeight || 360;
    var scale = Math.min(1, widthLimit / safeWidth, heightLimit / safeHeight);
    return {
      width: Math.max(1, Math.round(safeWidth * scale)),
      height: Math.max(1, Math.round(safeHeight * scale)),
    };
  }

  function getComicPageAspectRatio(width, height) {
    var safeWidth = Math.max(1, Number(width) || 1);
    var safeHeight = Math.max(1, Number(height) || 1);
    return safeWidth + " / " + safeHeight;
  }

  function isCurrentComicPageLoad(
    loadGeneration,
    currentGeneration,
    entry,
    currentEntry
  ) {
    return loadGeneration === currentGeneration && entry === currentEntry;
  }

  return {
    isComicImageName: isComicImageName,
    sortComicPageNames: sortComicPageNames,
    patchCbrWorkerSource: patchCbrWorkerSource,
    getComicPreviewSize: getComicPreviewSize,
    getComicPageAspectRatio: getComicPageAspectRatio,
    isCurrentComicPageLoad: isCurrentComicPageLoad,
  };
});
