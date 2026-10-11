// Downscale an image in the browser and return a JPEG data URL. Keeping the
// result small matters because avatars and stories are stored inline on the row
// (there is no object storage), and the API rejects payloads over ~1.5 MB.

export async function compressImage(file: File, maxDim = 1080, quality = 0.82): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file')
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not process that image')
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  return canvas.toDataURL('image/jpeg', quality)
}
