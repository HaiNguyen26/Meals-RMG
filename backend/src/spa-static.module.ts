import { existsSync } from 'fs';
import { join } from 'path';
import { DynamicModule, Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';

const defaultDistPath = () =>
  process.env.FRONTEND_DIST_PATH ??
  join(__dirname, '..', '..', 'frontend', 'dist');

/** Serves Vite build + SPA fallback on the same port as the API (nginx can proxy only to Node). */
@Module({})
export class SpaStaticModule {
  static register(): DynamicModule {
    const rootPath = defaultDistPath();
    const hasSpa = existsSync(join(rootPath, 'index.html'));

    if (!hasSpa) {
      return { module: SpaStaticModule };
    }

    return {
      module: SpaStaticModule,
      imports: [
        ServeStaticModule.forRoot({
          rootPath,
          useGlobalPrefix: true,
          serveRoot: '/',
          serveStaticOptions: {
            index: false,
            fallthrough: true,
          },
          exclude: [
            '/meals-rmg/auth*',
            '/meals-rmg/lunch*',
            '/meals-rmg/socket.io*',
            '/meals-rmg/health',
          ],
        }),
      ],
    };
  }
}
