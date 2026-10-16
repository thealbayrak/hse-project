// Concatenates the migrations and the seed into supabase/apply-all.sql so the
// whole setup can be pasted into the Supabase SQL editor in one go.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../supabase/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const migrationsDir = join(root, "migrations");
const files = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => join("migrations", name));
files.push("seed.sql");

const output = files
  .map((file) => `-- ===== supabase/${file.replaceAll("\\", "/")} =====\n${readFileSync(join(root, file), "utf8")}`)
  .join("\n\n");

writeFileSync(join(root, "apply-all.sql"), output);
console.log(`supabase/apply-all.sql written (${files.length} files, ${output.length} bytes)`);
