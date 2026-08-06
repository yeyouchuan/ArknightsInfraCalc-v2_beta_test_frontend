import { Buffer } from "node:buffer";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { stdout } from "node:process";

const buildRoot = path.resolve(".next");
const clientRoot = path.join(buildRoot, "static");
const appRoot = path.join(buildRoot, "server", "app");
const forbiddenMarkers = [
  { label: "森空岛用户文案", value: "森空岛" },
  { label: "森空岛公开 API", value: "/api/skland" },
  { label: "森空岛 App 拉起地址", value: "skland://" },
];

async function collectFiles(root, include) {
  const files = [];
  async function visit(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await visit(target);
      } else if (include(target)) {
        files.push(target);
      }
    }
  }
  await visit(root);
  return files;
}

await stat(clientRoot).catch(() => {
  throw new Error("找不到 .next/static，请先运行 production build。");
});

const clientFiles = await collectFiles(clientRoot, (file) => file.endsWith(".js"));
const publicDocuments = await collectFiles(
  appRoot,
  (file) => !file.includes(`${path.sep}api${path.sep}`) && (file.endsWith(".html") || file.endsWith(".rsc"))
);
const inspectedFiles = [...clientFiles, ...publicDocuments];
const violations = [];
let inspectedBytes = 0;

for (const file of inspectedFiles) {
  const contents = await readFile(file, "utf8");
  inspectedBytes += Buffer.byteLength(contents);
  for (const marker of forbiddenMarkers) {
    if (contents.includes(marker.value)) {
      violations.push(`${path.relative(buildRoot, file)}：${marker.label}`);
    }
  }
}

if (violations.length) {
  throw new Error(`production 浏览器产物仍包含森空岛登录相关内容：\n${violations.join("\n")}`);
}

stdout.write(
  `production 浏览器产物隔离通过：检查 ${inspectedFiles.length} 个文件、${inspectedBytes} 字节，未包含森空岛文案、API 或 App 拉起地址。\n`
);
