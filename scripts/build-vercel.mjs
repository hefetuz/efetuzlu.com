import { copyFile, mkdir, readdir, rm, stat } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

const root = process.cwd();
const outDir = join(root, "dist");

const entries = [
  "404.html",
  "assets",
  "cms",
  "index.html",
  "js",
  "robots.txt",
  "site.webmanifest",
  "sitemap.xml",
  "styles.css",
  "work"
];

const excludedFiles = new Set([
  join("js", "cms", "admin.js")
]);

async function copyEntry(entry) {
  const source = join(root, entry);
  const destination = join(outDir, entry);
  const sourceStats = await stat(source);
  const relativePath = relative(root, source);

  if (excludedFiles.has(relativePath)) return;

  if (sourceStats.isDirectory()) {
    await mkdir(destination, { recursive: true });
    const children = await readdir(source);
    for (const child of children) {
      await copyEntry(join(entry, child));
    }
    return;
  }

  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
}

try {
  await rm(outDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
} catch (error) {
  if (error?.code !== "EPERM") throw error;
  console.warn("Could not fully clear dist on Windows; copying fresh files over the existing output.");
}
await mkdir(outDir, { recursive: true });

for (const entry of entries) {
  await copyEntry(entry);
}

const files = await readdir(outDir);
console.log(`Built Vercel output in dist (${files.length} top-level entries).`);
