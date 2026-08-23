import { MongoClient, type Db } from "mongodb";

declare global {
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

function getMongoUri(): string {
  if (typeof process !== "undefined" && process.env) {
    if (process.env["MONGODB_URI"]) return process.env["MONGODB_URI"];
    if (process.env["VITE_MONGODB_URI"]) return process.env["VITE_MONGODB_URI"];
  }
  return "mongodb://localhost:27017/resume_radiance";
}

let clientInstance: MongoClient | null = null;
let clientPromise: Promise<MongoClient> | null = null;

async function getConnectedClient(): Promise<MongoClient> {
  const uri = getMongoUri();
  const options = {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  };

  if (!clientPromise) {
    const client = new MongoClient(uri, options);
    clientInstance = client;
    clientPromise = client
      .connect()
      .then((c) => {
        return c;
      })
      .catch((err) => {
        // Reset cache on error so subsequent requests can retry
        clientPromise = null;
        clientInstance = null;
        throw err;
      });
  }
  return clientPromise;
}

export async function getDb(): Promise<Db> {
  if (typeof window !== "undefined") {
    throw new Error("MongoDB cannot be called directly from browser.");
  }
  const client = await getConnectedClient();
  return client.db("resume_radiance");
}

export async function pingMongo(): Promise<{ ok: boolean; message: string; dbName: string }> {
  try {
    const db = await getDb();
    const result = await db.command({ ping: 1 });
    if (result["ok"] === 1) {
      return {
        ok: true,
        message: "MongoDB Atlas connected successfully!",
        dbName: db.databaseName,
      };
    }
    return { ok: false, message: "Ping failed.", dbName: db.databaseName };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `MongoDB connection error: ${msg}`, dbName: "resume_radiance" };
  }
}
