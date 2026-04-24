const fs = require("fs");
const path = require("path");

function patchPgStreamFile(filePath) {
  if (!fs.existsSync(filePath)) return false;
  const original = fs.readFileSync(filePath, "utf8");
  const from = "require('pg-cloudflare')";
  const to = "eval('require')('pg-cloudflare')";
  if (!original.includes(from)) return false;
  const patched = original.replace(from, to);
  fs.writeFileSync(filePath, patched, "utf8");
  return true;
}

function main() {
  const cwd = process.cwd();
  const pgPackagePath = require.resolve("pg/package.json", { paths: [cwd] });
  const pgDir = path.dirname(pgPackagePath);
  const streamPath = path.join(pgDir, "lib", "stream.js");

  if (patchPgStreamFile(streamPath)) {
    console.log("Patched pg/lib/stream.js for Cloudflare OpenNext bundling.");
  }
}

main();
