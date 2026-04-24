const fs = require("fs");
const path = require("path");

function safeExists(target) {
  try {
    return fs.existsSync(target);
  } catch {
    return false;
  }
}

function main() {
  const cwd = process.cwd();
  const pgDir = path.dirname(require.resolve("pg/package.json", { paths: [cwd] }));
  const nestedPkgDir = path.join(pgDir, "node_modules", "pg-cloudflare");
  const nestedDistIndex = path.join(nestedPkgDir, "dist", "index.js");

  // If nested optional dependency is missing, Node can resolve top-level dependency.
  if (!safeExists(nestedPkgDir) || safeExists(nestedDistIndex)) {
    return;
  }

  const topPkgDir = path.dirname(
    require.resolve("pg-cloudflare/package.json", { paths: [cwd] })
  );
  const topDistDir = path.join(topPkgDir, "dist");
  const nestedDistDir = path.join(nestedPkgDir, "dist");

  if (!safeExists(path.join(topDistDir, "index.js"))) {
    throw new Error(
      "pg-cloudflare fallback dist/index.js not found at top-level dependency."
    );
  }

  fs.mkdirSync(nestedDistDir, { recursive: true });

  for (const file of ["index.js", "index.js.map", "index.d.ts", "empty.js", "empty.js.map", "empty.d.ts"]) {
    const source = path.join(topDistDir, file);
    if (safeExists(source)) {
      fs.copyFileSync(source, path.join(nestedDistDir, file));
    }
  }

  console.log("Patched nested pg-cloudflare dist files for Cloudflare build.");
}

main();
