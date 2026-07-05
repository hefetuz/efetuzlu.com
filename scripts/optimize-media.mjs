import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const ffmpeg = resolve(root, ".tools", "ffmpeg", "bin", "ffmpeg.exe");
const sourceDirectory = resolve(root, "assets", "cms");
const outputDirectory = resolve(root, "assets", "optimized");
const staticImageExtensions = new Set([".jpeg", ".jpg", ".png"]);
const animatedImageExtensions = new Set([".gif"]);
const videoExtensions = new Set([".m4v", ".mov", ".mp4", ".ogg", ".ogv", ".webm"]);

function runFfmpeg(args) {
  const result = spawnSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", ...args], {
    cwd: root,
    encoding: "utf8"
  });

  if (result.status !== 0) {
    throw new Error(result.error?.message || result.stderr || result.stdout || `ffmpeg failed with status ${result.status}`);
  }
}

function outputPath(file, suffix, extension) {
  const name = basename(file, extname(file));
  return join(outputDirectory, `${name}-${suffix}${extension}`);
}

function scaleFilter(maxWidth) {
  return `scale='min(${maxWidth},iw)':-2:flags=lanczos`;
}

function convertStaticImage(file) {
  const source = join(sourceDirectory, file);
  const cover = outputPath(file, "cover", ".webp");
  const preview = outputPath(file, "preview", ".webp");

  runFfmpeg([
    "-i", source,
    "-vf", scaleFilter(900),
    "-frames:v", "1",
    "-c:v", "libwebp",
    "-quality", "84",
    "-compression_level", "6",
    "-preset", "picture",
    cover
  ]);

  runFfmpeg([
    "-i", source,
    "-vf", scaleFilter(1800),
    "-frames:v", "1",
    "-c:v", "libwebp",
    "-quality", "90",
    "-compression_level", "6",
    "-preset", "picture",
    preview
  ]);

  return [cover, preview];
}

function convertMotion(file) {
  const source = join(sourceDirectory, file);
  const cover = outputPath(file, "cover", ".webm");
  const preview = outputPath(file, "preview", ".webm");

  runFfmpeg([
    "-i", source,
    "-vf", `fps=30,${scaleFilter(900)}`,
    "-an",
    "-c:v", "libvpx-vp9",
    "-crf", "30",
    "-b:v", "0",
    "-row-mt", "1",
    "-deadline", "good",
    "-pix_fmt", "yuv420p",
    cover
  ]);

  runFfmpeg([
    "-i", source,
    "-vf", `fps=30,${scaleFilter(1600)}`,
    "-an",
    "-c:v", "libvpx-vp9",
    "-crf", "28",
    "-b:v", "0",
    "-row-mt", "1",
    "-deadline", "good",
    "-pix_fmt", "yuv420p",
    preview
  ]);

  return [cover, preview];
}

if (!existsSync(ffmpeg)) {
  throw new Error(`ffmpeg not found at ${ffmpeg}`);
}

mkdirSync(outputDirectory, { recursive: true });

const files = readdirSync(sourceDirectory)
  .filter((file) => statSync(join(sourceDirectory, file)).isFile())
  .sort((a, b) => a.localeCompare(b));

const results = [];
for (const file of files) {
  const extension = extname(file).toLowerCase();
  try {
    if (staticImageExtensions.has(extension)) {
      results.push({ file, outputs: convertStaticImage(file) });
      continue;
    }

    if (animatedImageExtensions.has(extension) || videoExtensions.has(extension)) {
      results.push({ file, outputs: convertMotion(file) });
    }
  } catch (error) {
    results.push({ file, error: error.message });
  }
}

const failures = results.filter((result) => result.error);
const converted = results.filter((result) => result.outputs);
const outputBytes = converted
  .flatMap((result) => result.outputs)
  .reduce((total, file) => total + statSync(file).size, 0);

console.log(JSON.stringify({
  converted: converted.length,
  failed: failures.length,
  outputMB: Number((outputBytes / 1024 / 1024).toFixed(2)),
  failures
}, null, 2));
