import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { MediaItem } from "@/lib/domain/media-types";

export type { MediaItem };

const BUCKET = "admin-media";
const ALLOWED_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"]);
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

function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
  };
  return map[mime] ?? "jpg";
}

/**
 * Upload an image to the admin media library bucket and persist metadata.
 * `kind` is a logical category: "broadcasts", "events", "general".
 */
export async function uploadMediaImage(
  academyId: string,
  file: File,
  opts: {
    kind?: string;
    title?: string;
    altText?: string;
    uploadedBy: string;
  },
): Promise<{ item: MediaItem } | { error: string }> {
  if (!ALLOWED_TYPES.has(file.type)) {
    return { error: "Unsupported file type. Use JPG, PNG, WebP, or GIF." };
  }
  if (file.size > MAX_SIZE_BYTES) {
    return { error: "File too large. Maximum size is 5 MB." };
  }

  const bucketErr = await ensureBucket();
  if (bucketErr) return { error: bucketErr };

  const sb = createAdminClient();
  const ext = extFromMime(file.type);
  const kind = opts.kind || "general";
  const ts = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  const storagePath = `${kind}/${ts}_${safeName}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadErr } = await sb.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: file.type, upsert: false });

  if (uploadErr) {
    return { error: `Upload failed: ${uploadErr.message}` };
  }

  const { data: urlData } = sb.storage.from(BUCKET).getPublicUrl(storagePath);
  const publicUrl = urlData.publicUrl;

  const { data: row, error: dbErr } = await sb
    .from("admin_media")
    .insert({
      academy_id: academyId,
      path: storagePath,
      public_url: publicUrl,
      filename: file.name,
      mime_type: file.type,
      size_bytes: file.size,
      title: opts.title?.trim() || null,
      alt_text: opts.altText?.trim() || null,
      kind,
      uploaded_by: opts.uploadedBy,
    } as never)
    .select("*")
    .single();

  if (dbErr || !row) {
    await sb.storage.from(BUCKET).remove([storagePath]);
    return { error: `Metadata save failed: ${dbErr?.message ?? "unknown"}` };
  }

  return { item: mapMediaRow(row as Record<string, unknown>) };
}

export async function listMediaImages(
  academyId: string,
  kind?: string,
): Promise<MediaItem[]> {
  const sb = createAdminClient();
  let query = sb
    .from("admin_media")
    .select("*")
    .eq("academy_id", academyId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (kind) {
    query = query.eq("kind", kind);
  }

  const { data, error } = await query;
  if (error) {
    console.warn("[admin-media] list:", error.message);
    return [];
  }
  return ((data ?? []) as Record<string, unknown>[]).map(mapMediaRow);
}

export async function deleteMediaImage(
  mediaId: string,
): Promise<{ success: boolean; error?: string }> {
  const sb = createAdminClient();

  const { data: row } = await sb
    .from("admin_media")
    .select("path")
    .eq("id", mediaId)
    .single();

  if (!row) return { success: false, error: "Image not found." };

  const path = (row as { path: string }).path;
  await sb.storage.from(BUCKET).remove([path]);

  const { error } = await sb
    .from("admin_media")
    .delete()
    .eq("id", mediaId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

function mapMediaRow(r: Record<string, unknown>): MediaItem {
  return {
    id: r.id as string,
    path: r.path as string,
    publicUrl: r.public_url as string,
    filename: r.filename as string,
    mimeType: r.mime_type as string,
    sizeBytes: (r.size_bytes as number) ?? 0,
    title: (r.title as string) ?? null,
    altText: (r.alt_text as string) ?? null,
    kind: (r.kind as string) ?? "general",
    uploadedBy: r.uploaded_by as string,
    createdAt: r.created_at as string,
  };
}
