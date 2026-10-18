/**
 * PUT a file straight to storage with a presigned URL, reporting progress
 * (fetch cannot report upload progress, XMLHttpRequest can).
 */
export function putWithProgress(url: string, file: File, onProgress?: (fraction: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (HTTP ${xhr.status})`)));
    xhr.onerror = () =>
      reject(new Error("Upload failed. If you use Cloudflare R2, check the bucket's CORS policy (see README)."));
    xhr.send(file);
  });
}
