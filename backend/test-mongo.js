// backend/test-mongo.js (for testing connection)
const { MongoClient, ServerApiVersion } = require('mongodb');
const uri = process.env.MONGO_URI || "mongodb+srv://fieldledger:LBiS5%40u%26@nexa.sus4z0m.mongodb.net/fieldledger?appName=nexa";

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
  retryWrites: true,
  retryReads: true,
  connectTimeoutMS: 30000,
  socketTimeoutMS: 30000
});

async function run() {
  try {
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    await client.close();
  }
}
run().catch(console.dir);