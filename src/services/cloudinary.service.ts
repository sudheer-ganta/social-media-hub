const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

export function isCloudinaryConfigured(): boolean {
  return Boolean(cloudName && uploadPreset);
}

export interface CloudinaryUploadResult {
  url: string;
}

/**
 * Delete tokens returned by unsigned uploads (valid ~10 minutes). Lets us
 * clean up a just-uploaded image when the user replaces it, without
 * exposing an API secret in the browser. Older images simply expire from
 * this map — deleting those safely requires a signed backend call.
 */
const deleteTokens = new Map<string, string>();

export const cloudinaryService = {
  uploadImage(
    file: File,
    onProgress?: (percent: number) => void,
  ): Promise<CloudinaryUploadResult> {
    if (!isCloudinaryConfigured()) {
      return Promise.reject(
        new Error(
          "Cloudinary is not configured. Set VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET in your .env file.",
        ),
      );
    }

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(
        "POST",
        `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      );

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const body = JSON.parse(xhr.responseText) as {
              secure_url: string;
              delete_token?: string;
            };
            if (body.delete_token) {
              deleteTokens.set(body.secure_url, body.delete_token);
            }
            resolve({ url: body.secure_url });
          } catch {
            reject(new Error("Unexpected response from Cloudinary."));
          }
        } else {
          let message = `Upload failed (${xhr.status}).`;
          try {
            const body = JSON.parse(xhr.responseText) as {
              error?: { message?: string };
            };
            if (body.error?.message) message = body.error.message;
          } catch {
            // keep the generic message
          }
          reject(new Error(message));
        }
      };

      xhr.onerror = () => reject(new Error("Network error during upload."));

      const form = new FormData();
      form.append("file", file);
      form.append("upload_preset", uploadPreset);
      xhr.send(form);
    });
  },

  /**
   * Best-effort delete of a replaced/removed image. Only works for images
   * uploaded this session with a preset that returns delete tokens.
   */
  async deleteImage(url: string): Promise<void> {
    const token = deleteTokens.get(url);
    if (!token || !isCloudinaryConfigured()) return;
    deleteTokens.delete(url);

    try {
      await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/delete_by_token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        },
      );
    } catch {
      // Non-fatal: the orphaned asset can be pruned from the Cloudinary console.
    }
  },
};
