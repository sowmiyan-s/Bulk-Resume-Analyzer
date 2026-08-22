import { MongoClient, type Db } from "mongodb";

declare global {
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

const DEFAULT_URI =
  "mongodb+srv://rdxsparrowgaming_db_user:Sowmiyan123.@cluster0.er22sa5.mongodb.net/resume_radiance?retryWrites=true&w=majority";

function getMongoUri(): string {
  if (typeof process !== "undefined" && process.env && process.env["MONGODB_URI"]) {
    return process.env["MONGODB_URI"];
  }
  return DEFAULT_URI;
}

let clientPromise: Promise<MongoClient>;

if (typeof window === "undefined") {
  const uri = getMongoUri();
  const options = {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  };

  if (process.env.NODE_ENV === "development") {
    // In development mode, use a global variable so that the value
    // is preserved across module reloads caused by HMR (Hot Module Replacement).
    if (!globalThis._mongoClientPromise) {
      const client = new MongoClient(uri, options);
      globalThis._mongoClientPromise = client.connect();
    }
    clientPromise = globalThis._mongoClientPromise;
  } else {
    // In production mode, it's best to not use a global variable.
    const client = new MongoClient(uri, options);
    clientPromise = client.connect();
  }
} else {
  clientPromise = Promise.reject(new Error("MongoDB cannot be called directly from browser."));
}

export async function getDb(): Promise<Db> {
  const client = await clientPromise;
  return client.db("resume_radiance");
}

export async function pingMongo(): Promise<{ ok: boolean; message: string; dbName: string }> {
  try {
    const db = await getDb();
    const result = await db.command({ ping: 1 });
    if (result.ok === 1) {
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
