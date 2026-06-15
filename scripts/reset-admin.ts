import { close, createOnlyOwnerAdmin } from '../lib/db';

async function main() {
  await createOnlyOwnerAdmin();
  console.log('MongoDB cleared. Owner account and bill history remain.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(close);
