import 'dotenv/config';
import { close, seedIfEmpty } from '../lib/db';

async function main() {
  const seeded = await seedIfEmpty();
  console.log(seeded ? 'MongoDB seed data created.' : 'MongoDB already contains users; seed skipped.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(close);
