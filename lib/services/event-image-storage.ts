import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "event-covers";

function coverPath(eventId: string, ext: string): string {
  return `${eventId}/cover.${ext}`;
}

function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };
  return map[mime] ?? "jpg";
}

const ALLOWED_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

let _bucketReady = false;

async function ensureBucket(): Promise<string | null> {
  if (_bucketReady) return null;
  const sb = createAdminClient();
  const { data } = await sb.storage.getBucket(BUCKET);
  if (!data) {
    const { error } = await sb.storage.createBucket(BUCKET, { public: true });
    if (error && !error.message.includes("already exists")) {
      return `Storage setup failed: ${error.message}`;
    }
  } else if (!data.public) {
    await sb.storage.updateBucket(BUCKET, { public: true });
  }
  _bucketReady = true;
  return null;
}

/**
 * Upload an event cover image to Supabase Storage.
 * Auto-creates the bucket on first use.
 * Overwrites any existing cover for this event.
 * Returns the public URL on success.
 */
export async function uploadEventCover(
  eventId: string,
  file: File,
): Promise<{ url: string } | { error: string }> {
  if (!ALLOWED_TYPES.has(file.type)) {
    return { error: "Unsupported file type. Use JPG, PNG, or WebP." };
  }
  if (file.size > MAX_SIZE_BYTES) {
    return { error: "File too large. Maximum size is 5 MB." };
  }

  const bucketErr = await ensureBucket();
  if (bucketErr) return { error: bucketErr };

  const sb = createAdminClient();
  const ext = extFromMime(file.type);
  const path = coverPath(eventId, ext);

  await removeEventCover(eventId);

  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await sb.storage.from(BUCKET).upload(path, buffer, {
    contentType: file.type,
    upsert: true,
  });

  if (error) {
    console.warn("[event-image] Upload failed:", error.message);
    return { error: `Upload failed: ${error.message}` };
  }

  const { data: urlData } = sb.storage.from(BUCKET).getPublicUrl(path);
  return { url: urlData.publicUrl };
}

/**
 * Remove the event cover image from Storage.
 * Tries all supported extensions since we don't know which was used.
 */
export async function removeEventCover(eventId: string): Promise<void> {
  const sb = createAdminClient();
  const extensions = ["jpg", "png", "webp"];
  const paths = extensions.map((ext) => coverPath(eventId, ext));
  await sb.storage.from(BUCKET).remove(paths);
}
