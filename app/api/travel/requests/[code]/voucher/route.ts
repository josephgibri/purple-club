import { promises as fs } from "node:fs";
import path from "node:path";
import { get } from "@vercel/blob";
import { hasAdminConsoleAccess, readSession } from "@/lib/wallet-session";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * Authenticated voucher streaming proxy.
 *
 * We never expose the underlying Vercel Blob URL (or local /uploads path) to
 * the client. The DB stores the true storage URL, the proxy authenticates the
 * current session, verifies the caller owns the booking (or is a maintainer),
 * and then streams the PDF back. That way a leaked voucher URL in logs /
 * history / screenshares does not give anyone PII access.
 *
 * New uploads land in a *private* Vercel Blob store and are fetched via the
 * @vercel/blob SDK with BLOB_PRIVATE_READ_WRITE_TOKEN. Legacy URLs from the
 * old public store (recognised by the `.public.blob.vercel-storage.com`
 * hostname) are still streamed via plain fetch so existing bookings keep
 * working until the old store is fully decommissioned.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ code: string }> },
) {
  const { code } = await ctx.params;
  if (!code) {
    return Response.json({ error: "Missing request code." }, { status: 400 });
  }

  const session = await readSession();
  if (!session?.wallet) {
    return Response.json(
      { error: "Wallet authentication required." },
      { status: 401 },
    );
  }

  const record = await prisma.travelRequest.findUnique({
    where: { requestCode: code },
    select: {
      wallet: true,
      voucherUrl: true,
      voucherFileName: true,
    },
  });

  if (!record || !record.voucherUrl) {
    return Response.json({ error: "Voucher not found." }, { status: 404 });
  }

  const isOwner = record.wallet === session.wallet;
  const isAdmin = hasAdminConsoleAccess(session.wallet);
  if (!isOwner && !isAdmin) {
    return Response.json({ error: "Forbidden." }, { status: 403 });
  }

  const voucherUrl = record.voucherUrl;

  if (/^https?:\/\//i.test(voucherUrl)) {
    // Legacy public blob — fetch directly, no auth required. Detected by the
    // `.public.blob.vercel-storage.com` hostname that the old store uses.
    const isLegacyPublicBlob = /\.public\.blob\.vercel-storage\.com\//i.test(
      voucherUrl,
    );

    if (isLegacyPublicBlob) {
      let upstream: Response;
      try {
        upstream = await fetch(voucherUrl, {
          headers: { Accept: "application/pdf" },
          cache: "no-store",
        });
      } catch (error) {
        console.error("[voucher-proxy] upstream fetch failed:", error);
        return Response.json(
          { error: "Voucher storage is temporarily unavailable." },
          { status: 502 },
        );
      }
      if (!upstream.ok || !upstream.body) {
        return Response.json(
          { error: "Voucher could not be retrieved." },
          { status: 502 },
        );
      }
      return new Response(upstream.body, {
        status: 200,
        headers: buildHeaders(record.voucherFileName),
      });
    }

    // Private blob — fetch via SDK with the private store token. Without the
    // token nobody (not even Vercel's CDN cache) will hand the bytes back.
    const privateToken =
      process.env.BLOB_PRIVATE_READ_WRITE_TOKEN?.trim() ||
      process.env.BLOB_READ_WRITE_TOKEN?.trim();
    if (!privateToken) {
      console.error("[voucher-proxy] no blob token configured");
      return Response.json(
        { error: "Voucher storage is not configured." },
        { status: 500 },
      );
    }

    let result: Awaited<ReturnType<typeof get>>;
    try {
      result = await get(voucherUrl, {
        access: "private",
        token: privateToken,
      });
    } catch (error) {
      console.error("[voucher-proxy] private blob get failed:", error);
      return Response.json(
        { error: "Voucher storage is temporarily unavailable." },
        { status: 502 },
      );
    }

    if (!result || result.statusCode !== 200 || !result.stream) {
      return Response.json(
        { error: "Voucher could not be retrieved." },
        { status: 502 },
      );
    }

    return new Response(result.stream, {
      status: 200,
      headers: buildHeaders(record.voucherFileName),
    });
  }

  // Local dev fallback: /uploads/vouchers/<file>.pdf on the public filesystem.
  if (voucherUrl.startsWith("/uploads/")) {
    const relative = voucherUrl.replace(/^\/+/, "");
    const resolved = path.resolve(path.join(process.cwd(), "public", relative));
    const publicRoot = path.resolve(path.join(process.cwd(), "public"));
    if (!resolved.startsWith(publicRoot + path.sep)) {
      return Response.json({ error: "Invalid voucher path." }, { status: 400 });
    }
    try {
      const buffer = await fs.readFile(resolved);
      return new Response(new Uint8Array(buffer), {
        status: 200,
        headers: buildHeaders(record.voucherFileName),
      });
    } catch (error) {
      console.error("[voucher-proxy] local read failed:", error);
      return Response.json({ error: "Voucher file missing." }, { status: 404 });
    }
  }

  return Response.json({ error: "Unsupported voucher URL." }, { status: 500 });
}

function buildHeaders(fileName: string | null) {
  const safeName =
    fileName && /^[A-Za-z0-9._-]+$/.test(fileName) ? fileName : "voucher.pdf";
  return {
    "Content-Type": "application/pdf",
    "Content-Disposition": `inline; filename="${safeName}"`,
    "Cache-Control": "private, max-age=0, no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  };
}
