const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

export function isCloudinaryConfigured(): boolean {
  return Boolean(cloudName && uploadPreset);
}

/**
 * Uploading the member's media, once, at full quality.
 *
 * ─── The master is sacred ────────────────────────────────────────────────────
 *
 * What goes up is the file they chose, untouched — no client-side resize, no
 * re-encode, no "optimisation" pass. Every platform-specific version is derived
 * from it on delivery by a URL transformation, which Cloudinary renders at
 * request time and which leaves the stored original byte-for-byte as it was.
 *
 *     original upload → Cloudinary master → delivery transformation → provider
 *
 * That is what keeps quality from decaying: a crop is a delivery setting rather
 * than a new upload, so cropping twice is not two generations of loss, and the
 * full-quality source stays available for every later use. Nothing in this app
 * ever uploads a derived copy back.
 *
 * ─── Two endpoints, one function ─────────────────────────────────────────────
 *
 * Cloudinary serves images and video from different resource paths, and a video
 * posted to `/image/upload` is rejected. The member should never have to know
 * that, so they get one "Add media" and this picks the endpoint from the file's
 * own type. See {@link uploadMedia}.
 */

export interface CloudinaryUploadResult {
  url: string;
  /** `image` or `video`, as Cloudinary classified what it stored. */
  kind: "image" | "video";
  /**
   * Everything Cloudinary measured while ingesting the file.
   *
   * From the upload response, which is the one party that has actually decoded
   * the file. Nothing here is guessed and nothing is filled in with a default —
   * a field Cloudinary did not report stays undefined, because a fabricated
   * duration is worse than a missing one: it validates.
   */
  width?: number;
  height?: number;
  bytes?: number;
  durationMs?: number;
  /** `image/jpeg`, `video/mp4` — rebuilt from Cloudinary's own format field. */
  mimeType?: string;
  /** A still frame, for video. A delivery URL; not a second stored asset. */
  posterUrl?: string;
}

/**
 * Delete tokens returned by unsigned uploads (valid ~10 minutes). Lets us
 * clean up a just-uploaded asset when the user replaces it, without
 * exposing an API secret in the browser. Older assets simply expire from
 * this map — deleting those safely requires a signed backend call.
 */
const deleteTokens = new Map<string, string>();

/** Cloudinary's own upload response, as much of it as we read. */
interface CloudinaryResponse {
  secure_url: string;
  resource_type?: string;
  format?: string;
  width?: number;
  height?: number;
  bytes?: number;
  /** Seconds, fractional. Video only. */
  duration?: number;
  delete_token?: string;
}

/**
 * The MIME type for a stored asset, from Cloudinary's own classification.
 *
 * Rebuilt rather than taken from `File.type`, because the browser's guess is
 * about the file that was selected and this is about the file that was stored —
 * and the capability checks that consume it run against the latter.
 */
function toMimeType(body: CloudinaryResponse): string | undefined {
  if (!body.format) return undefined;
  const kind = body.resource_type === "video" ? "video" : "image";
  // Cloudinary reports the container; these two do not map by concatenation.
  if (kind === "video" && body.format === "mov") return "video/quicktime";
  if (kind === "image" && body.format === "jpg") return "image/jpeg";
  return `${kind}/${body.format}`;
}

/**
 * A poster frame for a stored video.
 *
 * Swapping the extension asks Cloudinary to render one frame of the same
 * asset — a read, not an upload. Costs no storage and does not touch the
 * master.
 */
function toPosterUrl(url: string): string | undefined {
  const at = url.lastIndexOf(".");
  return at === -1 ? undefined : `${url.slice(0, at)}.jpg`;
}

export const cloudinaryService = {
  /**
   * Uploads one file — image, GIF or video — and returns what Cloudinary
   * measured.
   *
   * The endpoint is chosen from the file's type because Cloudinary requires it,
   * not because the member should care. There is one "Add media" in the
   * composer and it accepts everything the selected networks can carry.
   */
  uploadMedia(
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

    // `resource_type: video` is Cloudinary's, and it covers audio too. An
    // animated GIF stays an image: it is stored, delivered and transformed as
    // one, and what makes it special is the *network's* rule about it, not
    // Cloudinary's.
    const isVideo = file.type.startsWith("video/");
    const resourceType = isVideo ? "video" : "image";

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(
        "POST",
        `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`,
      );

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const body = JSON.parse(xhr.responseText) as CloudinaryResponse;
            if (body.delete_token) {
              deleteTokens.set(body.secure_url, body.delete_token);
            }

            const kind = body.resource_type === "video" ? "video" : "image";

            resolve({
              url: body.secure_url,
              kind,
              // Spread rather than assigned, so a field Cloudinary omitted stays
              // absent instead of becoming `undefined` on a defined key or, far
              // worse, zero.
              ...(body.width ? { width: body.width } : {}),
              ...(body.height ? { height: body.height } : {}),
              ...(body.bytes ? { bytes: body.bytes } : {}),
              ...(body.duration
                ? { durationMs: Math.round(body.duration * 1000) }
                : {}),
              ...(toMimeType(body) ? { mimeType: toMimeType(body)! } : {}),
              ...(kind === "video" && toPosterUrl(body.secure_url)
                ? { posterUrl: toPosterUrl(body.secure_url)! }
                : {}),
            });
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
   * The image-only name this used to have.
   *
   * Kept because callers outside the composer still use it and it means exactly
   * what it says. New code should call {@link cloudinaryService.uploadMedia},
   * which is the same function without the assumption.
   */
  uploadImage(
    file: File,
    onProgress?: (percent: number) => void,
  ): Promise<CloudinaryUploadResult> {
    return cloudinaryService.uploadMedia(file, onProgress);
  },

  /**
   * Best-effort delete of a replaced/removed asset. Only works for assets
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
