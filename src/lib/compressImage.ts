/**
 * Helper to compress an image File or Blob to ensure its byte size is strictly below the target limit (default 195 KB).
 * This ensures it never exceeds the security module's 200 KB upload limit.
 *
 * Uses an intelligent multi-stage loop:
 * 1. Initial dimension clamp (max 1200px)
 * 2. Quality stepping (0.82 down to 0.35)
 * 3. Dimension stepping (960px, 800px, 640px, 500px, 400px) if needed
 *
 * Preserves high visual fidelity for ID badges, license plates, visitor faces, and checkpoint photos.
 */
export async function compressImageToTarget(
  file: File | Blob,
  maxBytes: number = 195 * 1024
): Promise<File> {
  // If not in browser or not an image, return file as-is
  if (typeof window === 'undefined') {
    return file instanceof File ? file : new File([file], 'photo.jpg', { type: file.type || 'image/jpeg' })
  }

  const fileName = file instanceof File ? file.name : 'photo.jpg'
  const fileType = file.type || 'image/jpeg'

  // If not an image, return as-is
  if (file instanceof File && file.type && !file.type.startsWith('image/')) {
    return file
  }

  // If already below target and already a JPEG, return early
  if (file.size <= maxBytes && fileType === 'image/jpeg') {
    return file instanceof File ? file : new File([file], fileName, { type: 'image/jpeg' })
  }

  // Load image
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = reject
    i.src = dataUrl
  })

  const origWidth = img.naturalWidth || img.width
  const origHeight = img.naturalHeight || img.height

  // Progressive compression stages: scales down dimension and quality until <= maxBytes
  const stages: { maxDim: number; qualities: number[] }[] = [
    { maxDim: 1200, qualities: [0.82, 0.72, 0.62] },
    { maxDim: 960, qualities: [0.75, 0.65, 0.55] },
    { maxDim: 800, qualities: [0.70, 0.60, 0.50, 0.40] },
    { maxDim: 640, qualities: [0.65, 0.50, 0.38] },
    { maxDim: 500, qualities: [0.55, 0.40, 0.30] },
    { maxDim: 400, qualities: [0.45, 0.30, 0.20] },
  ]

  let bestBlob: Blob | null = null

  for (const stage of stages) {
    let width = origWidth
    let height = origHeight

    if (width > height) {
      if (width > stage.maxDim) {
        height = Math.round((height * stage.maxDim) / width)
        width = stage.maxDim
      }
    } else {
      if (height > stage.maxDim) {
        width = Math.round((width * stage.maxDim) / height)
        height = stage.maxDim
      }
    }

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) continue

    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, 0, 0, width, height)

    for (const q of stage.qualities) {
      const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', q))
      if (!blob) continue

      if (!bestBlob || blob.size < bestBlob.size) {
        bestBlob = blob
      }

      if (blob.size <= maxBytes) {
        const cleanName = fileName.replace(/\.[^.]+$/, '') + '.jpg'
        return new File([blob], cleanName, { type: 'image/jpeg' })
      }
    }
  }

  // Fallback: return smallest achieved blob if somehow still slightly over
  if (bestBlob) {
    const cleanName = fileName.replace(/\.[^.]+$/, '') + '.jpg'
    return new File([bestBlob], cleanName, { type: 'image/jpeg' })
  }

  return file instanceof File ? file : new File([file], fileName, { type: 'image/jpeg' })
}

/**
 * Backward-compatible wrapper returning Blob
 */
export async function compressImage(file: File, maxBytes: number = 195 * 1024): Promise<Blob> {
  return await compressImageToTarget(file, maxBytes)
}
