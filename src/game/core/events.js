// events.js
const handlers = new Map(); // eventName -> Set<fn>

export function on(event, fn) {
  if (!handlers.has(event)) handlers.set(event, new Set());
  handlers.get(event).add(fn);
}

export function off(event, fn) {
  handlers.get(event)?.delete(fn);
}

export function emit(event, payload) {
  const list = handlers.get(event);
  if (!list) return;
  for (const fn of list) {
    try { fn(payload); } catch (e) { console.warn("[events]", event, e); }
  }
}
