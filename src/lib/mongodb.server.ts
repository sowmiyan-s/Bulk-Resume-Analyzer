import type { MongoClient, Db } from "mongodb";

declare global {
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

function isValidMongoUri(uri?: string | null): boolean {
  if (!uri || typeof uri !== "string") return false;
  const trimmed = uri.trim();
  return trimmed.startsWith("mongodb://") || trimmed.startsWith("mongodb+srv://");
}

function readEnvSync(): Record<string, string> {
  const result: Record<string, string> = {};
  try {
    if (typeof window === "undefined" && typeof process !== "undefined" && process.cwd) {
      const fs = require("node:fs");
      const path = require("node:path");
      const envPath = path.resolve(process.cwd(), ".env");
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, "utf-8");
        for (const line of content.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const eqIdx = trimmed.indexOf("=");
          if (eqIdx > 0) {
            const k = trimmed.slice(0, eqIdx).trim();
            const v = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
            result[k] = v;
            if (process.env && !process.env[k]) {
              process.env[k] = v;
            }
          }
        }
      }
    }
  } catch {
    /* ignore fallback */
  }
  return result;
}

export function getMongoUri(): string | null {
  if (typeof process !== "undefined" && process.env) {
    const rawUri = process.env["MONGODB_URI"] || process.env["VITE_MONGODB_URI"];
    if (isValidMongoUri(rawUri)) {
      return rawUri!.trim();
    }
  }
  const fileEnv = readEnvSync();
  const fileUri = fileEnv["MONGODB_URI"] || fileEnv["VITE_MONGODB_URI"];
  if (isValidMongoUri(fileUri)) {
    return fileUri.trim();
  }
  return null;
}

export function getDatabaseNameFromUri(uri: string): string {
  try {
    // Pattern: mongodb+srv://user:pass@host/dbname?params
    const match = uri.match(/(?:mongodb(?:\+srv)?:\/\/[^/]+\/)([^?]+)/);
    if (match && match[1] && match[1].trim()) {
      return match[1].trim();
    }
  } catch {
    /* fallback */
  }
  return "resume_radiance";
}

async function getConnectedClient(): Promise<MongoClient> {
  let uri = getMongoUri();
  if (!uri) {
    throw new Error(
      "MongoDB is not configured. Please set the MONGODB_URI environment variable in your .env file.",
    );
  }

  const options = {
    maxPoolSize: 10,
    minPoolSize: 1,
    serverSelectionTimeoutMS: 8000,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 10000,
    retryWrites: true,
  };

  if (!globalThis._mongoClientPromise) {
    const { MongoClient } = await import("mongodb");
    const client = new MongoClient(uri, options);
    globalThis._mongoClientPromise = client
      .connect()
      .then((c) => {
        return c;
      })
      .catch((err) => {
        // Reset singleton on error so subsequent requests can retry
        globalThis._mongoClientPromise = undefined;
        throw err;
      });
  }

  return globalThis._mongoClientPromise;
}

export async function getDb(): Promise<Db> {
  if (typeof window !== "undefined") {
    throw new Error("MongoDB cannot be called directly from browser.");
  }
  const uri = getMongoUri();
  const dbName = uri ? getDatabaseNameFromUri(uri) : "resume_radiance";
  const client = await getConnectedClient();
  return client.db(dbName);
}

export async function pingMongo(): Promise<{
  ok: boolean;
  message: string;
  dbName: string;
  latencyMs?: number;
}> {
  const start = Date.now();
  try {
    const uri = getMongoUri();
    if (!uri) {
      return {
        ok: false,
        message: "MongoDB is not configured (MONGODB_URI missing in .env).",
        dbName: "resume_radiance",
      };
    }
    const db = await getDb();
    const result = await db.command({ ping: 1 });
    const latency = Date.now() - start;
    if (result["ok"] === 1) {
      return {
        ok: true,
        message: `MongoDB Atlas connected successfully (${latency}ms latency)!`,
        dbName: db.databaseName,
        latencyMs: latency,
      };
    }
    return { ok: false, message: "Ping command failed.", dbName: db.databaseName, latencyMs: latency };
  } catch (err) {
    const latency = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      message: `MongoDB connection error: ${msg}`,
      dbName: "resume_radiance",
      latencyMs: latency,
    };
  }
}
