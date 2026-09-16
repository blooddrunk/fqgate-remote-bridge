import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, readdir, rename, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { BridgeError, ERROR_CODES } from "../../shared/errors.js";

export interface FqgateLayout {
  readonly home: string;
  readonly fqgateDirectory: string;
  readonly currentDirectory: string;
  readonly previousDirectory: string;
  readonly currentExecutable: string;
  readonly previousExecutable: string;
  readonly downloadsDirectory: string;
  readonly logsDirectory: string;
  readonly stateFile: string;
  readonly processFile: string;
  readonly lockFile: string;
  readonly transactionFile: string;
}

export function createFqgateLayout(home: string): FqgateLayout {
  const fqgateDirectory = join(home, "fqgate");
  const currentDirectory = join(fqgateDirectory, "current");
  const previousDirectory = join(fqgateDirectory, "previous");
  return {
    home,
    fqgateDirectory,
    currentDirectory,
    previousDirectory,
    currentExecutable: join(currentDirectory, "fqgate.exe"),
    previousExecutable: join(previousDirectory, "fqgate.exe"),
    downloadsDirectory: join(home, "downloads"),
    logsDirectory: join(home, "logs"),
    stateFile: join(fqgateDirectory, "state.json"),
    processFile: join(fqgateDirectory, "process.json"),
    lockFile: join(fqgateDirectory, "install.lock"),
    transactionFile: join(fqgateDirectory, "transaction.json"),
  };
}

export async function ensureFqgateLayout(layout: FqgateLayout): Promise<void> {
  await Promise.all([
    mkdir(layout.currentDirectory, { recursive: true }),
    mkdir(layout.previousDirectory, { recursive: true }),
    mkdir(layout.downloadsDirectory, { recursive: true }),
    mkdir(layout.logsDirectory, { recursive: true }),
  ]);
}

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

export async function sha256File(filePath: string): Promise<{ size: number; sha256: string }> {
  const file = await readFile(filePath);
  return {
    size: file.byteLength,
    sha256: createHash("sha256").update(file).digest("hex"),
  };
}

export async function writeJsonAtomically(filePath: string, value: unknown): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  const handle = await open(temporaryPath, "wx");
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }

  try {
    await rename(temporaryPath, filePath);
  } catch (error) {
    const backupPath = `${filePath}.${randomUUID()}.bak`;
    try {
      await rename(filePath, backupPath);
      try {
        await rename(temporaryPath, filePath);
      } catch (replaceError) {
        await rename(backupPath, filePath).catch(() => undefined);
        throw replaceError;
      }
      await rm(backupPath, { force: true });
    } catch (replaceError) {
      await rm(temporaryPath, { force: true });
      if (
        replaceError instanceof Error &&
        "code" in replaceError &&
        replaceError.code === "ENOENT"
      ) {
        throw error;
      }
      throw replaceError;
    }
  }
}

export async function readJsonFile(filePath: string): Promise<unknown | undefined> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as unknown;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

export async function cleanupStagingArtifacts(directory: string): Promise<void> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return;
    }
    throw error;
  }

  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && /\.(?:part|candidate)$/.test(entry.name))
      .map((entry) => rm(join(directory, entry.name), { force: true })),
  );
}

export async function moveFile(source: string, destination: string): Promise<void> {
  await mkdir(dirname(destination), { recursive: true });
  try {
    await rename(source, destination);
  } catch (error) {
    throw new BridgeError(
      ERROR_CODES.ACTIVATION_FAILED,
      `Unable to move managed FQGate file into place: ${destination}`,
      undefined,
      { cause: error },
    );
  }
}

export async function removeFile(filePath: string): Promise<void> {
  await rm(filePath, { force: true });
}
