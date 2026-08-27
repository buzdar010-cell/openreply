/**
 * Photo storage for photo-based logs. Photos are kept (not discarded after
 * parsing) so a user can review what they logged, same reasoning as any
 * receipt/record -- see the app-flow discussion this module implements.
 */

function photoKey(deviceId: string, logId: string, ext: string): string {
  // Namespaced by device so a bucket listing/prefix-scan can be scoped per
  // user if ever needed (e.g. account deletion / data export).
  return `photos/${deviceId}/${logId}.${ext}`;
}

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Stores a photo, returns the R2 object key to save alongside the log row. */
export async function storePhoto(
  bucket: R2Bucket,
  deviceId: string,
  logId: string,
  imageBytes: ArrayBuffer,
  mimeType: "image/jpeg" | "image/png" | "image/webp",
): Promise<string> {
  const key = photoKey(deviceId, logId, EXT_BY_MIME[mimeType]);
  await bucket.put(key, imageBytes, {
    httpMetadata: { contentType: mimeType },
  });
  return key;
}

/** Retrieves a stored photo by its key, or null if it doesn't exist. */
export async function getPhoto(bucket: R2Bucket, key: string): Promise<R2ObjectBody | null> {
  return bucket.get(key);
}
