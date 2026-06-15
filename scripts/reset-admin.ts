import { close, createOnlyDefaultLogins } from '../lib/db';

async function main() {
  await createOnlyDefaultLogins();
  console.log('MongoDB cleared. Only the owner admin and manager login accounts remain.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(close);
