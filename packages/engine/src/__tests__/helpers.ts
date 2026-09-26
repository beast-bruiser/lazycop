import { createStore } from "../store.js";
import type { StoreState } from "../store.js";

/** A store with LazyCop watching task `s-1`, as after /lazycop. */
export function watchedStore(id = "s-1"): StoreState {
  const store = createStore();
  store.session = { id, task: "Add coupon expiry" };
  return store;
}
