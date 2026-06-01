import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { put } from "@vercel/blob";
import { hasAdminConsoleAccess, readSession } from "@/lib/wallet-session";
import { prisma } from "@/lib/prisma";
import { voucherProxyUrl } from "@/lib/voucher";

export const runtime = "nodejs";

const MAX_VOUCHER_BYTES = 15 * 1024 * 1024; // 15MB

/**
 * Voucher upload.
 *
 * Production (Vercel): we store the PDF in a *private* Vercel Blob store via
 * BLOB_PRIVATE_READ_WRITE_TOKEN. Private blobs cannot be fetched without the
 * token, so even if the underlying URL leaks (logs, screen share, browser
 * history) it is useless to anyone outside our server. Members read vouchers
 * exclusively through /api/travel/requests/[code]/voucher, which authenticates
 * the session and pipes the PDF back via the @vercel/blob SDK.
 *
 * Backward compat: if the legacy BLOB_READ_WRITE_TOKEN is the only one set
 * (e.g. on a stale Preview env), we fall back to the old public flow so a
 * deploy doesn't break voucher uploads mid-migration. Once Production has
 * BLOB_PRIVATE_READ_WRITE_TOKEN, this branch is never taken in prod.
 *
 * Local dev: when no Blob token is configured at all, we write to
 * public/uploads/vouchers so the dev workflow keeps working without extra
 * setup.
 *
 * The route also persists the voucher URL + filename + uploadedAt to the
 * TravelRequest row directly, so the UI does not need a follow-up save_draft
 * (which would re-validate offer fields and risk wiping them out).
 */
export async function POST(request: Request) {
  try {
    const session = await readSession();
    if (!session?.wallet) {
      return Response.json(
        { error: "Wallet authentication required." },
        { status: 401 },
      );
    }
    if (!hasAdminConsoleAccess(session.wallet)) {
      return Response.json(
        { error: "Admin access required." },
        { status: 403 },
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const requestId = formData.get("requestId");
    if (!(file instanceof File)) {
      return Response.json(
        { error: "PDF file is required." },
        { status: 400 },
      );
    }
    if (file.type !== "application/pdf") {
      return Response.json(
        { error: "Only PDF files are allowed." },
        { status: 400 },
      );
    }
    if (file.size > MAX_VOUCHER_BYTES) {
      return Response.json(
        { error: "Voucher PDF must be under 15MB." },
        { status: 413 },
      );
    }

    const targetRequestId =
      typeof requestId === "string" && requestId.length > 0 ? requestId : null;
    if (targetRequestId) {
      const exists = await prisma.travelRequest.findUnique({
        where: { id: targetRequestId },
        select: { id: true },
      });
      if (!exists) {
        return Response.json(
          { error: "Booking not found." },
          { status: 404 },
        );
      }
    }

    const uuidName = `${crypto.randomUUID()}.pdf`;
    const privateToken = process.env.BLOB_PRIVATE_READ_WRITE_TOKEN?.trim();
    const legacyPublicToken = process.env.BLOB_READ_WRITE_TOKEN?.trim();

    let voucherUrl: string;
    if (privateToken) {
      // Private blob: URL alone grants no access; only the proxy with the
      // store token can fetch it back. addRandomSuffix is still on as
      // defence-in-depth in case a token ever leaks.
      const blob = await put(`vouchers/${uuidName}`, file, {
        access: "private",
        contentType: "application/pdf",
        token: privateToken,
        addRandomSuffix: true,
      });
      voucherUrl = blob.url;
    } else if (legacyPublicToken) {
      // Migration fallback: only the legacy public token is available. New
      // uploads land in the old public store. Once BLOB_PRIVATE_READ_WRITE_TOKEN
      // is wired up everywhere, this branch becomes dead code.
      const blob = await put(`vouchers/${uuidName}`, file, {
        access: "public",
        contentType: "application/pdf",
        token: legacyPublicToken,
        addRandomSuffix: true,
      });
      voucherUrl = blob.url;
    } else {
      const targetDir = path.join(
        process.cwd(),
        "public",
        "uploads",
        "vouchers",
      );
      try {
        await fs.mkdir(targetDir, { recursive: true });
        const buffer = Buffer.from(await file.arrayBuffer());
        await fs.writeFile(path.join(targetDir, uuidName), buffer);
      } catch (writeError) {
        console.error("[voucher-upload] local write failed:", writeError);
        return Response.json(
          {
            error:
              "Voucher storage is not configured. Set BLOB_PRIVATE_READ_WRITE_TOKEN in your environment.",
          },
          { status: 500 },
        );
      }
      voucherUrl = `/uploads/vouchers/${uuidName}`;
    }

    let proxiedUrl: string | null = null;
    if (targetRequestId) {
      const updated = await prisma.travelRequest.update({
        where: { id: targetRequestId },
        data: {
          voucherUrl,
          voucherFileName: uuidName,
          voucherUploadedAt: new Date(),
        },
        select: { requestCode: true },
      });
      proxiedUrl = voucherProxyUrl(updated.requestCode);
    }

    return Response.json({
      // Return the proxy URL — never leak the raw Vercel Blob URL to the UI.
      voucherUrl: proxiedUrl,
      voucherFileName: uuidName,
    });
  } catch (error) {
    console.error("[voucher-upload] failed:", error);
    return Response.json(
      { error: "Unable to upload voucher." },
      { status: 500 },
    );
  }
}
