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

module.exports = { encodeCoverToLosslessWebp };
