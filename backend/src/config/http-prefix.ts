/**
 * Global HTTP prefix for REST (setGlobalPrefix).
 * - Default `meals-rmg/api`: browser gọi /meals-rmg/api/lunch/... và nginx chuyển nguyên URI tới Nest.
 * - `bare` hoặc rỗng: route tại /lunch, /auth — dùng khi nginx đã rewrite, chỉ gửi /lunch/... tới Node.
 */
export function resolveNestHttpPrefix(): string | undefined {
  const v = process.env.NEST_HTTP_PREFIX;
  if (v === undefined || v === null) {
    return 'meals-rmg/api';
  }
  const t = String(v)
    .trim()
    .replace(/^\uFEFF/, '');
  if (t === '' || t.toLowerCase() === 'bare') {
    return undefined;
  }
  const normalized = t.replace(/^\/+|\/+$/g, '');
  return normalized || undefined;
}
