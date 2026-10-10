/** Prefix a public-folder path with the env basePath, when the app is mounted under one. */
export function publicAsset(path: string): string {
  const base = (process.env.NEXT_PUBLIC_BASE_PATH || "").trim().replace(/\/$/, "");
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalized}`;
}
