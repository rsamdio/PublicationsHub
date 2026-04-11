'use strict';

const sharp = require('sharp');

/**
 * Encode any raster image buffer to VP8L lossless WebP for object-stored covers.
 * `effort` 0–6: higher = smaller files, slower (default in sharp is 4; we use 6 for better compression).
 */
async function encodeCoverToLosslessWebp(inputBuffer) {
  return sharp(inputBuffer)
    .rotate()
    .webp({
      lossless: true,
      effort: 6
    })
    .toBuffer();
}

/** Catalog / grid thumbnail: bounded lossy WebP (long edge max 512px). */
const THUMB_LONG_EDGE = 512;

async function encodeCoverToThumbWebp(inputBuffer) {
  return sharp(inputBuffer)
    .rotate()
    .resize({
      width: THUMB_LONG_EDGE,
      height: THUMB_LONG_EDGE,
      fit: 'inside',
      withoutEnlargement: true
    })
    .webp({ quality: 85, effort: 4 })
    .toBuffer();
}

module.exports = { encodeCoverToLosslessWebp, encodeCoverToThumbWebp };
