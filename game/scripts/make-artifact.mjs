// Turns dist/index.html into dist/artifact.html: the same game without the
// doctype/html/head/body wrapper, which the artifact host adds itself.
import { readFileSync, writeFileSync } from "node:fs";

const html = readFileSync("dist/index.html", "utf8");
const head = html.match(/<head>([\s\S]*?)<\/head>/i)?.[1] ?? "";
const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? "";
const keep = head
  .replace(/<meta charset[^>]*>/i, "")
  .replace(/<meta name="viewport"[^>]*>/i, "");
const title = "<title>熄燈號之後 試玩版</title>";
const rest = keep.replace(/<title>[\s\S]*?<\/title>/i, "");
writeFileSync("dist/artifact.html", `${title}\n${rest}\n${body}\n`);
console.log("artifact.html", (title.length + rest.length + body.length) / 1024 | 0, "KB");
