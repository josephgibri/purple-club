import { put } from "@vercel/blob";

import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/svg+xml",
  "image/gif",
]);

export async function POST(request: Request): Promise<Response> {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return Response.json(
      {
        error:
          "Image hosting is not configured. Add BLOB_READ_WRITE_TOKEN, or paste an external image URL instead.",
      },
      { status: 503 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Expected multipart/form-data." }, { status: 400 });
  }

  const file = form.get("file");
  const kindRaw = form.get("kind");
  const kind = typeof kindRaw === "string" && kindRaw === "hero" ? "hero" : "logo";

  if (!(file instanceof File)) {
    return Response.json({ error: "No file uploaded." }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return Response.json(
      { error: "Unsupported image type. Use JPG, PNG, WEBP, GIF, or SVG." },
      { status: 415 },
    );
  }
  if (file.size > MAX_BYTES) {
    return Response.json(
      { error: `Image is too large. Max ${MAX_BYTES / 1024 / 1024}MB.` },
      { status: 413 },
    );
  }

  const ext = (file.name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  const key = `listings/${session.uid}/${kind}-${Date.now()}.${ext}`;

  try {
    const blob = await put(key, file, {
      access: "public",
      contentType: file.type,
      addRandomSuffix: true,
    });
    return Response.json({ url: blob.url, pathname: blob.pathname });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return Response.json({ error: message }, { status: 502 });
  }
}
