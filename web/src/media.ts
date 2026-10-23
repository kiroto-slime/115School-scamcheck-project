/** 瀏覽器端的圖片處理：先縮小再上傳，節省流量，也讓伺服器（Cloudflare 免費方案）不用處理大檔。 */

const MAX_SIDE = 1600

export interface PreparedImage {
  base64: string
  mime: 'image/jpeg'
}

/** 縮到最長邊 1600px 並轉成 JPEG（品質 0.85），回傳不含前綴的 base64 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  const bitmap = await loadBitmap(file)
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('瀏覽器無法處理圖片，請改用其他瀏覽器。')
  ctx.fillStyle = '#ffffff' // 透明背景（PNG）轉 JPEG 時補白底
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(bitmap, 0, 0, w, h)
  if ('close' in bitmap) (bitmap as ImageBitmap).close()
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
  return { base64: dataUrl.slice(dataUrl.indexOf(',') + 1), mime: 'image/jpeg' }
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file)
    } catch {
      /* 舊版 Safari 退回用 <img> 載入 */
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return img
  } catch {
    throw new Error('圖片已損毀或格式不支援，請重新選擇。')
  } finally {
    URL.revokeObjectURL(url)
  }
}

export const videoMime = (file: File) => (file.name.toLowerCase().endsWith('.mov') || file.type === 'video/quicktime' ? 'video/quicktime' : 'video/mp4')
