// Service client Cloudinary: unsigned direct upload (client -> Cloudinary) - requires VITE_CLOUDINARY_UPLOAD_PRESET

const CLOUD_NAME = (typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env.VITE_CLOUDINARY_CLOUD_NAME) || 'dsu3ojex3';
const UPLOAD_PRESET = (typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env.VITE_CLOUDINARY_UPLOAD_PRESET) || '';

// helper: resize image to limit width while keeping aspect ratio, returns a Blob
export async function resizeImageFile(file: File, maxWidth = 1024, quality = 0.8): Promise<Blob> {
  if (!file.type.startsWith('image/')) return file;
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const i = new Image();
    i.onload = () => { URL.revokeObjectURL(url); resolve(i); };
    i.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    i.src = url;
  });

  const canvas = document.createElement('canvas');
  const ratio = img.width / img.height;
  const width = Math.min(maxWidth, img.width);
  const height = Math.round(width / ratio);
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(img, 0, 0, width, height);
  return await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b as Blob), 'image/jpeg', quality));
}

// Upload to Cloudinary unsigned (client) with progress
export async function uploadWithProgress(file: File | Blob, onProgress?: (pct: number) => void): Promise<string> {
  if (!UPLOAD_PRESET || UPLOAD_PRESET.length === 0) {
    throw new Error('VITE_CLOUDINARY_UPLOAD_PRESET must be set in environment variables');
  }

  return await new Promise((resolve, reject) => {
    try {
      const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/upload`;
      const fd = new FormData();
      const filename = (file as File)?.name || `upload_${Date.now()}.jpg`;
      fd.append('file', file as Blob, filename);
      fd.append('upload_preset', UPLOAD_PRESET);
      // optional folder
      // fd.append('folder', 'signalements');

      const xhr = new XMLHttpRequest();
      xhr.open('POST', url);
      xhr.onload = () => {
        try {
          if (xhr.status >= 200 && xhr.status < 300) {
            const j = JSON.parse(xhr.responseText);
            resolve(j.secure_url || j.url);
          } else {
            reject(new Error(`Cloudinary unsigned upload failed ${xhr.status}: ${xhr.responseText}`));
          }
        } catch (err) { reject(err); }
      };
      xhr.onerror = () => reject(new Error('Network error while uploading to Cloudinary'));
      if (xhr.upload && onProgress) {
        xhr.upload.onprogress = (ev) => { if (ev.lengthComputable) onProgress(Math.round((ev.loaded / ev.total) * 100)); };
      }
      xhr.send(fd);
    } catch (e) {
      reject(e);
    }
  });
}


export async function uploadFile(file: File): Promise<string> {
  return await uploadWithProgress(file);
}

export async function uploadBase64(base64data: string): Promise<string> {
  const res = await fetch(base64data);
  const blob = await res.blob();
  return await uploadWithProgress(blob);
}

export function getOptimizedUrl(publicIdOrUrl: string, options?: { width?: number; height?: number; crop?: string }) {
  // If already a URL, return as-is
  if (/^https?:\/\//.test(publicIdOrUrl)) return publicIdOrUrl;
  const params: string[] = [];
  if (options?.width) params.push(`w_${options.width}`);
  if (options?.height) params.push(`h_${options.height}`);
  if (options?.crop) params.push(`c_${options.crop}`);
  const transformations = params.length ? params.join(',') + '/' : '';
  return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/${transformations}${publicIdOrUrl}`;
}

export default { uploadFile, uploadBase64, uploadWithProgress, resizeImageFile, getOptimizedUrl };
