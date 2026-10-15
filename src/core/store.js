// Tiny observable store. `set(patch)` merges and schedules one notification per animation
// frame; subscribers run only when their selected value changes (Object.is, or element-wise for
// arrays). `flush()` delivers pending notifications immediately (the render loop calls it once
// per frame, tests call it after an action).

const same = (a, b) => {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) return a.every((x, i) => Object.is(x, b[i]));
  return false;
};

export function createStore(initial) {
  let state = { ...initial };
  const subs = [];
  let scheduled = false;

  const store = {
    get: () => state,
    set(patch) {
      state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
      if (!scheduled) {
        scheduled = true;
        const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (cb) => setTimeout(cb, 16);
        raf(() => store.flush());
      }
    },
    subscribe(selector, fn, { immediate = true } = {}) {
      const sub = { selector, fn, value: selector(state) };
      subs.push(sub);
      if (immediate) fn(sub.value, state);
      return () => subs.splice(subs.indexOf(sub), 1);
    },
    flush() {
      scheduled = false;
      // Subscribers may set state; loop until stable (bounded).
      for (let pass = 0; pass < 5; pass++) {
        let changed = false;
        for (const sub of [...subs]) {
          const v = sub.selector(state);
          if (!same(v, sub.value)) {
            sub.value = v;
            changed = true;
            sub.fn(v, state);
          }
        }
        if (!changed) break;
      }
    }
  };
  return store;
}
