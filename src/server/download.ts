import "server-only";

export const refuse = (message: string, status: number) =>
  new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

/** Another site must not be able to make the browser fetch a user's file. */
export const isCrossSite = (request: Request) => request.headers.get("sec-fetch-site") === "cross-site";

export function download(body: BodyInit, type: string, filename: string) {
  return new Response(body, {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${filename.replace(/[^A-Za-z0-9._-]/g, "-")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
