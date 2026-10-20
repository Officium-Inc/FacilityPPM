import sharp from 'sharp'

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']

// Images are converted to WebP at 80% quality, max 1920px on the longest side
const IMAGE_MAX_PX = 1920
const IMAGE_QUALITY = 80

export async function optimizeImage(raw: Buffer) {
  return sharp(raw)
    .rotate() // auto-orient from EXIF
    .resize(IMAGE_MAX_PX, IMAGE_MAX_PX, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: IMAGE_QUALITY })
    .toBuffer()
}

/** PDF renderers cannot embed WebP, so photos are converted to a small JPEG first. */
export async function toPdfJpeg(raw: Buffer, maxPx = 900) {
  return sharp(raw)
    .rotate()
    .resize(maxPx, maxPx, { fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 75 })
    .toBuffer()
}
