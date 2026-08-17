const fs = require("node:fs");
const path = require("node:path");

const getPublicPackageDirs = (rootDir = process.cwd()) => {
  const packagesDir = path.join(rootDir, "packages");

  return fs
    .readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join("packages", entry.name))
    .filter((relativePath) => {
      const packagePath = path.join(rootDir, relativePath, "package.json");
      if (!fs.existsSync(packagePath)) return false;
      const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
      return packageJson.private !== true;
    })
    .sort();
};

module.exports = { getPublicPackageDirs };
