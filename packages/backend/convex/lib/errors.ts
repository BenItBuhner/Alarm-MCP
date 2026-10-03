import { ConvexError } from "convex/values";

/** User-facing failure. ConvexError is returned to clients in production; `Error` is redacted. */
export function fail(message: string): never {
  throw new ConvexError(message);
}
