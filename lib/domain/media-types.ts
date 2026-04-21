export interface MediaItem {
  id: string;
  path: string;
  publicUrl: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  title: string | null;
  altText: string | null;
  kind: string;
  uploadedBy: string;
  createdAt: string;
}
