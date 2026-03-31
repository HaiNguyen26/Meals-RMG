import { existsSync } from 'fs';
import { join } from 'path';
import { DynamicModule, Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';

const defaultDistPath = () =>
  process.env.FRONTEND_DIST_PATH ??
  join(__dirname, '..', '..', 'frontend', 'dist');

/** SPA + assets at /meals-rmg/; API is /meals-rmg/api (useGlobalPrefix on Nest). */
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
          },
          exclude: [
            '/meals-rmg/api{/*path}',
            '/meals-rmg/socket.io{/*path}',
          ],
        }),
      ],
    };
  }
}
