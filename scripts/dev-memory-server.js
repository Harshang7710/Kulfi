const { MongoMemoryServer } = require('mongodb-memory-server');
const fs = require('fs');

(async () => {
  const mongod = await MongoMemoryServer.create({ instance: { port: 27117 } });
  const uri = mongod.getUri();
  fs.writeFileSync('/tmp/kulfi-mongo-uri.txt', uri);
  console.log('MONGO_READY', uri);
  process.on('SIGTERM', async () => {
    await mongod.stop();
    process.exit(0);
  });
})();
