import { close, createOnlyOwnerAdmin } from '../lib/db';

async function main() {
  await createOnlyOwnerAdmin();
  console.log('MongoDB cleared. Only the owner admin account remains.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(close);
