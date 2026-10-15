// Custom integer ratio input, with an inline error for invalid input.

export function initCustomRatio(store, actions) {
  const input = document.getElementById('input-custom-ratio');
  const error = document.getElementById('custom-ratio-error');
  const apply = () => actions.applyCustomRatio(input.value);
  document.getElementById('btn-apply-ratio').addEventListener('click', apply);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') apply(); });
  input.addEventListener('input', () => { if (store.get().customError) store.set({ customError: '' }); });
  store.subscribe(s => s.customError, (msg) => {
    error.textContent = msg;
    error.hidden = !msg;
    input.classList.toggle('invalid', !!msg);
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
  });
}
