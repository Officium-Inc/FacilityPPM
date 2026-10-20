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
