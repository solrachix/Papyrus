(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.PapyrusComicRuntime = factory();
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

  return { isComicImageName: isComicImageName, sortComicPageNames: sortComicPageNames };
});
