const fs = require("fs");
const path = require("path");

function main() {
  const pgPackagePath = require.resolve("pg/package.json", { paths: [process.cwd()] });
  const pgDir = path.dirname(pgPackagePath);
  const streamFile = path.join(pgDir, "lib", "stream.js");

  const source = fs.readFileSync(streamFile, "utf8");
  const from = "require('pg-cloudflare')";
  const to = "eval('require')('pg-cloudflare')";

  if (!source.includes(from)) {
    return;
  }

  const patched = source.replace(from, to);
  fs.writeFileSync(streamFile, patched, "utf8");
  console.log("Patched pg/lib/stream.js to defer pg-cloudflare require.");
}

main();
