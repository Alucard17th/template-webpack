import { insertCoin } from "playroomkit";

let _insertCoinPromise = null;

export function ensureInsertCoin(options) {
  if (!_insertCoinPromise) {
    _insertCoinPromise = insertCoin(options);
  }
  return _insertCoinPromise;
}
