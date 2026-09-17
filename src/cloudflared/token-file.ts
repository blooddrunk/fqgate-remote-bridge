import { chmod, mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
import { dirname, isAbsolute, win32 } from "node:path";
import { randomUUID } from "node:crypto";
import { BridgeError, ERROR_CODES } from "../shared/errors.js";

export type TokenFileState = "secure" | "missing" | "unreadable" | "insecure";

export interface TokenFileStatus {
  readonly path: string;
  readonly state: TokenFileState;
}

export interface TokenFileAcl {
  secure(path: string, serviceAccount: string): Promise<void>;
  isSecure(path: string, serviceAccount: string): Promise<boolean>;
}

export interface TokenFileStoreOptions {
  readonly platform?: NodeJS.Platform;
  readonly acl: TokenFileAcl;
}

export class ProtectedTokenFileStore {
  private readonly platform: NodeJS.Platform;
  private readonly acl: TokenFileAcl;

  constructor(options: TokenFileStoreOptions) {
    this.platform = options.platform ?? process.platform;
    this.acl = options.acl;
  }

  async inspect(path: string, serviceAccount: string): Promise<TokenFileStatus> {
    try {
      const metadata = await stat(path);
      if (!metadata.isFile() || metadata.size === 0 || metadata.size > 16 * 1024) {
        return { path, state: "insecure" };
      }
      await readFile(path);
      if (this.platform !== "win32" && (metadata.mode & 0o077) !== 0) {
        return { path, state: "insecure" };
      }
      const secure = await this.acl.isSecure(path, serviceAccount);
      return { path, state: secure ? "secure" : "insecure" };
    } catch (error) {
      if (isFileMissing(error)) return { path, state: "missing" };
      return { path, state: "unreadable" };
    }
  }

  async assertUsable(path: string, serviceAccount: string): Promise<void> {
    const status = await this.inspect(path, serviceAccount);
    if (status.state !== "secure") {
      throw new BridgeError(
        ERROR_CODES.CLOUDFLARED_TOKEN_INVALID,
        "The cloudflared Tunnel token file is missing, unreadable, or not securely protected",
      );
    }
  }

  async write(path: string, token: string, serviceAccount: string): Promise<TokenFileStatus> {
    assertAbsoluteTokenPath(path, this.platform);
    if (token.trim().length === 0 || token.includes("\u0000")) {
      throw new BridgeError(
        ERROR_CODES.CLOUDFLARED_TOKEN_INVALID,
        "The cloudflared Tunnel token is empty or invalid",
      );
    }

    await mkdir(dirname(path), { recursive: true });
    const temporaryPath = `${path}.${randomUUID()}.tmp`;
    try {
      const handle = await open(temporaryPath, "wx", 0o600);
      try {
        await handle.writeFile(`${token.trim()}\n`, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
      if (this.platform !== "win32") await chmod(temporaryPath, 0o600);
      await replaceFile(temporaryPath, path);
      await this.acl.secure(path, serviceAccount);
      const result = await this.inspect(path, serviceAccount);
      if (result.state !== "secure") {
        throw new BridgeError(
          ERROR_CODES.CLOUDFLARED_TOKEN_INVALID,
          "The cloudflared Tunnel token file could not be secured",
        );
      }
      return result;
    } catch (error) {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
      if (error instanceof BridgeError) throw error;
      throw new BridgeError(
        ERROR_CODES.CLOUDFLARED_TOKEN_INVALID,
        "The cloudflared Tunnel token file could not be created securely",
        undefined,
        { cause: error },
      );
    }
  }
}

export class PosixTokenFileAcl implements TokenFileAcl {
  async secure(path: string): Promise<void> {
    await chmod(path, 0o600);
  }

  async isSecure(path: string): Promise<boolean> {
    try {
      const metadata = await stat(path);
      return metadata.isFile() && (metadata.mode & 0o077) === 0;
    } catch {
      return false;
    }
  }
}

function assertAbsoluteTokenPath(path: string, platform: NodeJS.Platform): void {
  const absolute = platform === "win32" ? win32.isAbsolute(path) : isAbsolute(path);
  if (!absolute) {
    throw new BridgeError(
      ERROR_CODES.CLOUDFLARED_TOKEN_INVALID,
      "The cloudflared Tunnel token file path must be absolute",
    );
  }
}

async function replaceFile(source: string, destination: string): Promise<void> {
  try {
    await rename(source, destination);
  } catch (error) {
    if (!isFileAlreadyExists(error)) throw error;
    await rm(destination, { force: true });
    await rename(source, destination);
  }
}

function isFileMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function isFileAlreadyExists(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error.code === "EEXIST" || error.code === "EPERM" || error.code === "EACCES")
  );
}
