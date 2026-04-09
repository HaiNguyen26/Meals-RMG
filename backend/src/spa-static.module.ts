import { existsSync } from 'fs';
import { join } from 'path';
import { DynamicModule, Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { resolveNestHttpPrefix } from './config/http-prefix';

const defaultDistPath = () =>
  process.env.FRONTEND_DIST_PATH ??
  join(__dirname, '..', '..', 'frontend', 'dist');

function serveStaticExcludePaths(): string[] {
  const mealsPublic =
    process.env.MEALS_PUBLIC_PATH?.replace(/\/+$/, '') ?? '/meals-rmg';
  const socketExclude = `${mealsPublic}/socket.io{/*path}`;
  const prefix = resolveNestHttpPrefix();
  if (prefix) {
    const slash = prefix.startsWith('/') ? prefix : `/${prefix}`;
    return [`${slash}{/*path}`, socketExclude];
  }
  return ['/lunch{/*path}', '/auth{/*path}', '/health', socketExclude];
}

/** SPA + assets at /meals-rmg/; API theo NEST_HTTP_PREFIX hoặc bare /lunch, /auth. */
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
          useGlobalPrefix: false,
          serveRoot: '/meals-rmg/',
          serveStaticOptions: {
            index: false,
            fallthrough: true,
            // index.html + SPA fallback: luôn revalidate → deploy mới không cần Ctrl+F5.
            // assets/* có hash: cache lâu.
            setHeaders: (res, filepath) => {
              const normalized = filepath.replace(/\\/g, '/');
              if (normalized.endsWith('index.html')) {
                res.setHeader(
                  'Cache-Control',
                  'no-cache, no-store, must-revalidate',
                );
                res.setHeader('Pragma', 'no-cache');
                res.setHeader('Expires', '0');
              } else if (normalized.includes('/assets/')) {
                res.setHeader(
                  'Cache-Control',
                  'public, max-age=31536000, immutable',
                );
              }
            },
          },
          exclude: serveStaticExcludePaths(),
        }),
      ],
    };
  }
}
