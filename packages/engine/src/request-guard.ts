import type http from "node:http";

/** Why a request is refused before it is routed, or null when it may go on.
 *  The server binds to localhost, but a browser can still reach it: a page on another
 *  site can POST to it, and DNS rebinding can make another name point at it. So only
 *  our own host names are served, only our own page may send an Origin, and POST bodies
 *  must be declared JSON, which a cross-site form or no-cors fetch cannot do. */
export function refusal(req: http.IncomingMessage): string | null {
  const port = req.socket.localPort;
  const own = [`127.0.0.1:${port}`, `localhost:${port}`];
  if (!own.includes(req.headers.host ?? "")) return "unknown host";
  const origin = req.headers.origin;
  if (origin !== undefined && !own.some((h) => origin === `http://${h}`)) return "foreign origin";
  if (req.method === "POST" && !/^application\/json\b/i.test(req.headers["content-type"] ?? "")) {
    return "content-type must be application/json";
  }
  return null;
}
