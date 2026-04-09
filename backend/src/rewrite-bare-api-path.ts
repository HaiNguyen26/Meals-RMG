import type { NextFunction, Request, Response } from 'express';
import { resolveNestHttpPrefix } from './config/http-prefix';

/**
 * Chạy trên Express *trước* Nest router — sửa URI khi proxy chỉ gửi /lunch/..., /auth/... hoặc /api/lunch/...
 */
export function rewriteBareApiPath(req: Request, res: Response, next: NextFunction) {
  const prefix = resolveNestHttpPrefix();
  if (!prefix) {
    return next();
  }

  const leading = prefix.startsWith('/') ? prefix : `/${prefix}`;
  const raw = (req.originalUrl ?? req.url ?? '').split('#')[0];
  const qIndex = raw.indexOf('?');
  const pathOnly = qIndex >= 0 ? raw.slice(0, qIndex) : raw;
  const search = qIndex >= 0 ? raw.slice(qIndex) : '';

  if (pathOnly === leading || pathOnly.startsWith(`${leading}/`)) {
    return next();
  }

  const rewrite = (newPathWithQuery: string) => {
    req.url = newPathWithQuery;
    (req as { originalUrl?: string }).originalUrl = newPathWithQuery;
  };

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

  if (!isLegacyApiPath) {
    return next();
  }

  rewrite(`${leading}${pathOnly}${search}`);
  next();
}
