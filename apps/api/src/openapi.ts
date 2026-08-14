/**
 * Emit `openapi.json` — the contract between the API and the web.
 *
 * Why this exists (repo-split P1c): `packages/api-client` is 124 hand-written
 * lines whose types are kept in step with the server only because both live in
 * one repo and get edited in the same PR. That protection disappears the day
 * the repos split, and front/back drift stops being a question of if.
 *
 * So the direction is fixed: **the API produces the contract, the web consumes
 * it, and nobody hand-edits the generated client.** This script is the
 * producing half.
 *
 * It boots the real app rather than reading source, because the routes are the
 * truth — a guard, a global prefix or a route registered at runtime all belong
 * in the spec, and only a booted app knows about them. It never listens on a
 * port, but it does construct providers, so a database has to be reachable.
 * CI already runs the `postgres` step before this.
 */
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { AppModule } from './app.module';

async function generate() {
  const app = await NestFactory.create(AppModule, { logger: false, cors: false });
  // Must match main.ts, or every path in the spec is missing `/api`.
  app.setGlobalPrefix('api');

  const config = new DocumentBuilder()
    .setTitle('Certifine API')
    .setDescription(
      'C2C marketplace with per-category third-party authentication. ' +
        'Generated from the running app — do not hand-edit, and do not hand-edit ' +
        'the client generated from it.',
    )
    .setVersion(process.env.APP_VERSION ?? '0.0.0')
    .addBearerAuth()
    .build();

  const doc = SwaggerModule.createDocument(app, config);
  const out = join(process.cwd(), 'openapi.json');
  writeFileSync(out, JSON.stringify(doc, null, 2) + '\n');

  const paths = Object.keys(doc.paths ?? {}).length;
  const schemas = Object.keys(doc.components?.schemas ?? {}).length;
  // eslint-disable-next-line no-console
  console.log(`openapi.json written: ${paths} paths, ${schemas} schemas -> ${out}`);

  await app.close();
}

generate().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
