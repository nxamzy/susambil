import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { sql } from "./index.js";

const bu = dirname(fileURLToPath(import.meta.url));

const schema = await readFile(join(bu, "schema.sql"), "utf8");
// Ko'p buyruqli SQL faylni yuborish uchun oddiy (simple) protokol kerak
await sql.unsafe(schema).simple();

console.log("✅ Jadvallar yaratildi");
await sql.end();
