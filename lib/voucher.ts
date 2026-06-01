/**
 * Never return the raw Vercel Blob / filesystem URL to the client. The DB
 * stores the true storage URL so we can fetch it server-side, but the client
 * always gets a pointer to our authenticated proxy route instead.
 */
export function voucherProxyUrl(requestCode: string | null | undefined): string | null {
  if (!requestCode) return null;
  const encoded = encodeURIComponent(requestCode);
  return `/api/travel/requests/${encoded}/voucher`;
}

/** Replace a raw voucherUrl with the proxy URL when present. */
export function maskVoucher<
  T extends { requestCode?: string | null; voucherUrl?: string | null },
>(row: T): T {
  if (!row || row.voucherUrl == null) return row;
  return {
    ...row,
    voucherUrl: voucherProxyUrl(row.requestCode ?? null),
  };
}
