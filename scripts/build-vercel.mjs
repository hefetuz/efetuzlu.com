import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
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

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value) return [];
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function absoluteUrl(siteUrl, source = "") {
  if (!source) return `${siteUrl}/assets/cms/hant-product-01.png`;
  if (/^https?:\/\//i.test(source)) return source;
  return `${siteUrl}/${String(source).replace(/^\/+/, "")}`;
}

function replaceMetaContent(html, selector, content) {
  const escaped = escapeHtml(content);
  return html.replace(
    new RegExp(`(<meta ${selector} content=")[^"]*(">)`),
    `$1${escaped}$2`
  );
}

function buildProjectPage(template, content, project, index) {
  const site = content.site || {};
  const siteUrl = String(site.siteUrl || "https://efetuzlu.online").replace(/\/+$/, "");
  const brandName = site.brandName || "Halim Efe Tuzlu";
  const title = `${project.title} | ${brandName}`;
  const description = project.description || project.summary || site.description || title;
  const url = `${siteUrl}/work/${project.slug}/`;
  const image = absoluteUrl(siteUrl, project.image);
  const keywords = [
    ...normalizeList(project.services || project.service),
    ...normalizeList(project.techStack || project.stack),
    ...normalizeList(project.industry || project.scope)
  ].join(", ");
  const schema = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: project.title,
    position: index + 1,
    url,
    image,
    description,
    creator: {
      "@type": "Person",
      name: brandName,
      url: `${siteUrl}/`
    }
  };

  if (keywords) schema.keywords = keywords;

  let html = template;
  html = html.replace(/<title>.*?<\/title>/, `<title>${escapeHtml(title)}</title>`);
  html = replaceMetaContent(html, 'name="description"', description);
  html = html.replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${escapeHtml(url)}">`);
  html = replaceMetaContent(html, 'property="og:title"', title);
  html = replaceMetaContent(html, 'property="og:description"', description);
  html = replaceMetaContent(html, 'property="og:url"', url);
  html = replaceMetaContent(html, 'property="og:image"', image);
  html = replaceMetaContent(html, 'name="twitter:title"', title);
  html = replaceMetaContent(html, 'name="twitter:description"', description);
  html = replaceMetaContent(html, 'name="twitter:image"', image);
  html = html.replace(
    /<script type="application\/ld\+json">.*?<\/script>/,
    `<script type="application/ld+json">${JSON.stringify(schema)}</script>`
  );

  return html;
}

async function generateProjectPages() {
  const [template, rawContent] = await Promise.all([
    readFile(join(root, "index.html"), "utf8"),
    readFile(join(root, "cms", "content.json"), "utf8")
  ]);
  const content = JSON.parse(rawContent);
  const projects = Array.isArray(content.projects) ? content.projects : [];

  for (const [index, project] of projects.entries()) {
    if (!project?.slug || !project?.title) continue;
    const page = buildProjectPage(template, content, project, index);
    const destination = join(outDir, "work", project.slug, "index.html");
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, page);
  }
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

await generateProjectPages();

const files = await readdir(outDir);
console.log(`Built Vercel output in dist (${files.length} top-level entries).`);
process.exit(0);
