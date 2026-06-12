// Copy the images + audio referenced by manifest.json into public/ so Remotion
// can load them via staticFile(). Rewrites nothing in the manifest; the
// composition resolves image paths as-is (relative to public/).
//
// Usage: node scripts/copy-assets.mjs

import fs from "node:fs/promises";
import path from "node:path";
import {
  MANIFEST_PATH,
  IMAGES_SRC,
  PUBLIC_DIR,
  PUBLIC_IMAGES,
  PUBLIC_AUDIO,
} from "./lib/paths.mjs";

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

// Resolve an image referenced as "images/page_XXX_YYY.jpg" against IMAGES_SRC,
// tolerating jpg/png mismatch.
async function resolveImage(refPath) {
  const base = path.basename(refPath);
  const candidates = [
    path.join(IMAGES_SRC, base),
    path.join(IMAGES_SRC, base.replace(/\.jpg$/i, ".png")),
    path.join(IMAGES_SRC, base.replace(/\.png$/i, ".jpg")),
  ];
  for (const c of candidates) if (await exists(c)) return c;
  return null;
}

async function main() {
  const manifest = JSON.parse(await fs.readFile(MANIFEST_PATH, "utf8"));
  await fs.mkdir(PUBLIC_IMAGES, { recursive: true });
  await fs.mkdir(PUBLIC_AUDIO, { recursive: true });

  let imgCopied = 0,
    imgMissing = 0,
    audioCopied = 0,
    audioMissing = 0;
  const missing = [];

  for (const lesson of manifest.lessons) {
    for (const fig of lesson.figures) {
      // Audio
      if (fig.audioSrc && (await exists(fig.audioSrc))) {
        const dest = path.join(PUBLIC_DIR, fig.audioPublic);
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.copyFile(fig.audioSrc, dest);
        audioCopied++;
      } else {
        audioMissing++;
        missing.push(`audio ${fig.audioSrc}`);
      }

      // Images referenced by segments
      for (const seg of fig.segments) {
        if (!seg.image) continue;
        const src = await resolveImage(seg.image.path);
        const destName = path.basename(seg.image.path);
        if (src) {
          await fs.copyFile(src, path.join(PUBLIC_IMAGES, destName));
          // Normalize manifest reference to the copied filename.
          seg.image.publicPath = `images/${destName}`;
          imgCopied++;
        } else {
          imgMissing++;
          missing.push(`image ${seg.image.path}`);
        }
      }
    }
  }

  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  // Also place a copy of the manifest in public so the bundle can fetch if needed.
  await fs.copyFile(MANIFEST_PATH, path.join(PUBLIC_DIR, "manifest.json"));

  console.log(
    `Images: ${imgCopied} copied, ${imgMissing} missing. Audio: ${audioCopied} copied, ${audioMissing} missing.`
  );
  if (missing.length) {
    console.log("Missing (first 20):");
    missing.slice(0, 20).forEach((m) => console.log("  - " + m));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
