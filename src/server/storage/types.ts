export interface ListResult {
  /** Object keys directly under the prefix (or all below it without a delimiter). */
  keys: string[];
  /** "Folders" under the prefix when listing with a delimiter, e.g. "jobs/abc/". */
  prefixes: string[];
}

/**
 * Minimal object storage used by the app and the worker. Keys use forward
 * slashes, e.g. "jobs/{id}/job.json". Implementations: R2 (production) and a
 * local folder (development without cloud credentials).
 */
export interface ObjectStore {
  readonly kind: "r2" | "local";
  /** Returns null when the object does not exist. */
  getText(key: string): Promise<string | null>;
  putText(key: string, body: string, contentType?: string): Promise<void>;
  putBuffer(key: string, body: Buffer, contentType: string): Promise<void>;
  /** Download an object to a local file (worker). */
  getToFile(key: string, filePath: string): Promise<void>;
  /** Upload a local file (worker). */
  putFile(key: string, filePath: string, contentType: string): Promise<void>;
  list(prefix: string, opts?: { delimiter?: string }): Promise<ListResult>;
  /** Every object under a prefix with its size ("" = whole bucket). One list operation per 1,000 objects. */
  listObjects(prefix: string): Promise<{ key: string; size: number }[]>;
  delete(key: string): Promise<void>;
  /** Delete every object whose key starts with prefix. Returns how many were deleted. */
  deletePrefix(prefix: string): Promise<number>;
  /** Time-limited URL the browser can GET. `downloadName` forces a download with that file name. */
  presignGet(key: string, opts?: { expiresIn?: number; downloadName?: string }): Promise<string>;
  /** Time-limited URL the browser can PUT to; the request must send the same Content-Type. */
  presignPut(key: string, contentType: string, opts?: { expiresIn?: number }): Promise<string>;
}

export const DEFAULT_URL_TTL_SEC = 3600;
