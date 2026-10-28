// `npm run seed`: fills the running emulators (`npm run emu`) with a demo shop. The data is in
// scripts/demoShop.ts; Vite loads it so it can use the app's TypeScript code as is.
import { createServer } from 'vite';

const server = await createServer({
  configFile: false,
  appType: 'custom',
  server: { middlewareMode: true, hmr: false },
  logLevel: 'error',
});
try {
  const { seedDemoShop } = await server.ssrLoadModule('/scripts/demoShop.ts');
  await seedDemoShop();
} catch (err) {
  console.error(err);
  console.error('Is `npm run emu` running?');
  process.exitCode = 1;
} finally {
  await server.close();
}
