// ── custom-selects.js ─────────────────────────────────────────────────────
// Renders a styled dropdown UI above native selects so Safari typography
// matches the rest of the app while preserving existing select-based logic.

const CUSTOM_SELECTS = new WeakMap();

function variantClassForSelect(select) {
  if (select.classList.contains('pregame-select')) return 'custom-select--pregame';
  if (select.classList.contains('lb-board-select')) return 'custom-select--leaderboard';
  if (select.classList.contains('game-mode-select')) return 'custom-select--game-mode';
  return '';
}

function closeCustomSelect(api) {
  if (!api || !api.open) return;
  api.open = false;
  api.wrap.classList.remove('open');
  api.trigger.setAttribute('aria-expanded', 'false');
}

function closeAllCustomSelects(except) {
  document.querySelectorAll('.custom-select.open').forEach(wrap => {
    const select = wrap.querySelector('select');
    const api = select ? CUSTOM_SELECTS.get(select) : null;
    if (api && api !== except) closeCustomSelect(api);
  });
}

function syncCustomSelect(select) {
  const api = CUSTOM_SELECTS.get(select);
  if (!api) return;

  api.trigger.disabled = select.disabled;
  const selectedOption = select.options[select.selectedIndex] || select.options[0];
  api.label.textContent = selectedOption ? selectedOption.textContent : '';
  api.menu.innerHTML = '';

  Array.from(select.options).forEach((option, index) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'custom-select__option';
    item.textContent = option.textContent;
    item.disabled = option.disabled;
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', option.selected ? 'true' : 'false');
    if (option.selected) item.classList.add('selected');
    item.addEventListener('click', () => {
      if (select.selectedIndex === index) {
        closeCustomSelect(api);
        return;
      }
      select.selectedIndex = index;
      syncCustomSelect(select);
      select.dispatchEvent(new Event('change', { bubbles: true }));
      closeCustomSelect(api);
    });
    api.menu.appendChild(item);
  });
}

function enhanceSelect(select) {
  if (!select || CUSTOM_SELECTS.get(select)) return;

  const wrap = document.createElement('div');
  wrap.className = 'custom-select';
  const variantClass = variantClassForSelect(select);
  if (variantClass) wrap.classList.add(variantClass);

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'custom-select__trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');

  const label = document.createElement('span');
  label.className = 'custom-select__label';

  const menu = document.createElement('div');
  menu.className = 'custom-select__menu';
  menu.setAttribute('role', 'listbox');

  const parent = select.parentNode;
  parent.insertBefore(wrap, select);
  wrap.appendChild(select);
  wrap.appendChild(trigger);
  trigger.appendChild(label);
  wrap.appendChild(menu);

  select.classList.add('native-select');
  select.setAttribute('tabindex', '-1');
  select.setAttribute('aria-hidden', 'true');

  const api = { wrap, trigger, label, menu, open: false };
  CUSTOM_SELECTS.set(select, api);

  trigger.addEventListener('click', () => {
    const willOpen = !api.open;
    closeAllCustomSelects(api);
    api.open = willOpen;
    wrap.classList.toggle('open', willOpen);
    trigger.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
  });

  select.addEventListener('change', () => syncCustomSelect(select));

  const observer = new MutationObserver(() => syncCustomSelect(select));
  observer.observe(select, { childList: true, subtree: true, attributes: true, attributeFilter: ['label', 'disabled', 'selected'] });

  syncCustomSelect(select);
}

function initCustomSelects() {
  document.querySelectorAll('select').forEach(enhanceSelect);
}

document.addEventListener('click', e => {
  if (!e.target.closest('.custom-select')) closeAllCustomSelects(null);
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeAllCustomSelects(null);
});

window.initCustomSelects = initCustomSelects;
window.refreshCustomSelect = syncCustomSelect;
