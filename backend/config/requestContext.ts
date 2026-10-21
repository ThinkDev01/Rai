import { AsyncLocalStorage } from 'node:async_hooks';

// Per-request context carried implicitly through the async call chain, so any
// code (controllers, models, middleware) can be tagged with the same reqId
// WITHOUT threading it through function arguments. The logger reads reqId from
// here via its `mixin` (see config/logger.ts), so every log line for one HTTP
// request shares the same reqId automatically.

interface RequestStore {
  reqId: number;
}

export const requestContext = new AsyncLocalStorage<RequestStore>();

// Monotonic per-process counter. Unique + incrementing within a single run;
// resets to 1 on restart/deploy (fine for debugging — pair with time + userId).
let counter = 0;
export function nextReqId(): number {
  return ++counter;
}

// reqId for the current request, or undefined outside a request (e.g. boot logs).
export function getReqId(): number | undefined {
  return requestContext.getStore()?.reqId;
}
