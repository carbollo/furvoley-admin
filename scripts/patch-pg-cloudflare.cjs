const fs = require("fs");
const path = require("path");

function patchPkgJson(pkgPath) {
  if (!fs.existsSync(pkgPath)) return false;
  const raw = fs.readFileSync(pkgPath, "utf8");
  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    return false;
  }

  const target = json?.exports?.["."]?.workerd;
  if (!target || target.require !== "./dist/index.js") return false;
  target.require = "./esm/index.mjs";
  fs.writeFileSync(pkgPath, JSON.stringify(json, null, 2) + "\n", "utf8");
  return true;
}

function main() {
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, "node_modules", "pg", "node_modules", "pg-cloudflare", "package.json"),
    path.join(cwd, "node_modules", "pg-cloudflare", "package.json"),
  ];

  let patchedAny = false;
  for (const file of candidates) {
    if (patchPkgJson(file)) patchedAny = true;
  }

  if (patchedAny) {
    console.log("Patched pg-cloudflare package exports for Cloudflare build.");
  }
}

main();
