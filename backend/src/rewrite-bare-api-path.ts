import type { NextFunction, Request, Response } from 'express';
import { resolveNestHttpPrefix } from './config/http-prefix';

/** Prefix đầy đủ mặc định (khớp frontend + nginx chuẩn). */
const FULL_API_PREFIX = '/meals-rmg/api';

/**
 * Chạy trên Express *trước* Nest router.
 * - Có global prefix: gắn /meals-rmg/api vào /lunch/..., /auth/..., /api/lunch/...
 * - bare (không prefix): nếu request vẫn là /meals-rmg/api/lunch/... thì cắt về /lunch/...
 */
export function rewriteBareApiPath(req: Request, res: Response, next: NextFunction) {
  const raw = (req.originalUrl ?? req.url ?? '').split('#')[0];
  const qIndex = raw.indexOf('?');
  const pathOnly = qIndex >= 0 ? raw.slice(0, qIndex) : raw;
  const search = qIndex >= 0 ? raw.slice(qIndex) : '';

  const rewrite = (newPathWithQuery: string) => {
    req.url = newPathWithQuery;
    (req as { originalUrl?: string }).originalUrl = newPathWithQuery;
  };

  const prefix = resolveNestHttpPrefix();

  if (prefix) {
    const leading = prefix.startsWith('/') ? prefix : `/${prefix}`;
    if (pathOnly === leading || pathOnly.startsWith(`${leading}/`)) {
      return next();
    }
    if (pathOnly.startsWith('/api/lunch') || pathOnly.startsWith('/api/auth')) {
      rewrite(`${leading}${pathOnly.slice(4)}${search}`);
      return next();
    }
    const isLegacyApiPath =
      pathOnly === '/lunch' ||
      pathOnly.startsWith('/lunch/') ||
      pathOnly === '/auth' ||
      pathOnly.startsWith('/auth/') ||
      pathOnly === '/health';

    if (isLegacyApiPath) {
      rewrite(`${leading}${pathOnly}${search}`);
    }
    return next();
  }

  // bare: route Nest là /lunch, /auth — gỡ /meals-rmg/api nếu proxy vẫn gửi path đầy đủ
  if (
    pathOnly === FULL_API_PREFIX ||
    pathOnly.startsWith(`${FULL_API_PREFIX}/`)
  ) {
    const rest = pathOnly.slice(FULL_API_PREFIX.length) || '/';
    if (
      rest.startsWith('/lunch') ||
      rest.startsWith('/auth') ||
      rest === '/health'
    ) {
      rewrite(`${rest}${search}`);
    }
  }
  return next();
}
