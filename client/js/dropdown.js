// =============================================
// dropdown.js - Custom animated dropdowns
//
// Shared by the main system and the Executive Portal so both open with the
// same staggered-menu animation. Replaces a native <select> with an animating
// listbox while keeping the original <select> in the DOM (hidden) as the
// single source of truth, so existing submit handlers, change listeners, and
// form resets keep working unchanged. The menu is rebuilt on every open, so
// selects whose options are populated dynamically (event pickers, transfer
// source/target) always show the current option set.
// =============================================

const Dropdowns = (() => {

  const bound = [];

  function bindDropdown(select) {
    if (!select || select.dataset.ddBound) return;
    select.dataset.ddBound = '1';

    const wrap = select.closest('.input-icon-wrap');
    const dd = document.createElement('div');
    dd.className = 'dd' + (wrap ? '' : ' dd-system');
    // Filter-bar selects size themselves via inline min-width; carry it over
    if (!wrap && select.style.minWidth) dd.style.minWidth = select.style.minWidth;

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'dd-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');

    const label = document.createElement('span');
    label.className = 'dd-label';

    const chevron = document.createElement('i');
    chevron.innerHTML = '<iconify-icon icon="solar:alt-arrow-down-linear"></iconify-icon>';
    chevron.className = 'dd-chevron';

    trigger.append(label, chevron);

    const menu = document.createElement('ul');
    menu.className = 'dd-menu';
    menu.setAttribute('role', 'listbox');

    function buildMenu() {
      menu.innerHTML = '';
      [...select.options].forEach((opt, i) => {
        const li = document.createElement('li');
        li.textContent = opt.text;
        if (opt.style?.color) li.style.color = opt.style.color;
        li.dataset.index = i;
        li.setAttribute('role', 'option');
        li.addEventListener('click', () => {
          // Disabled placeholder option - clicking it just dismisses the menu
          if (opt.disabled) { close(); return; }
          select.selectedIndex = i;
          sync();
          markSelected();
          select.dispatchEvent(new Event('change', { bubbles: true }));
          close();
        });
        menu.appendChild(li);
      });
    }

    // Clicking the menu's empty padding dismisses it instead of reaching a
    // covered field below, so a stray click can't accidentally pick an option.
    menu.addEventListener('click', e => {
      if (e.target === menu) close();
    });

    function sync() {
      const opt = select.options[select.selectedIndex];
      const hasValue = opt && opt.value;
      // Empty selects (options populated later) just show a blank label
      label.textContent = hasValue ? opt.text : select.options[0]?.text ?? '';
      label.classList.toggle('dd-placeholder', !hasValue);
    }

    function markSelected() {
      menu.querySelectorAll('li').forEach(li => {
        li.classList.toggle('dd-selected', Number(li.dataset.index) === select.selectedIndex);
      });
    }

    function open() {
      buildMenu(); // rebuild so dynamically-added options appear
      dd.classList.add('dd-open');
      trigger.setAttribute('aria-expanded', 'true');
      markSelected();
    }

    function close() {
      dd.classList.remove('dd-open');
      trigger.setAttribute('aria-expanded', 'false');
    }

    function pick(index) {
      if (index >= 0 && index < select.options.length) {
        select.selectedIndex = index;
        sync();
        markSelected();
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    trigger.addEventListener('click', e => {
      // No stopPropagation: letting this bubble to the document-level
      // listener closes any other open dropdown, so menus never overlap.
      if (dd.classList.contains('dd-open')) close();
      else open();
    });

    trigger.addEventListener('keydown', e => {
      if (e.key === 'Escape') { close(); trigger.focus(); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        pick(select.selectedIndex + (e.key === 'ArrowDown' ? 1 : -1));
      }
    });

    document.addEventListener('click', e => {
      if (!dd.contains(e.target)) close();
    });

    dd.append(trigger, menu);
    if (wrap) wrap.insertBefore(dd, select);
    else select.parentNode.insertBefore(dd, select);
    select.style.display = 'none';
    wrap?.querySelector('.input-icon-right')?.remove();

    sync();
    // Keep the label truthful when a form reset clears the hidden select.
    const form = select.closest('form');
    if (form) form.addEventListener('reset', sync);

    bound.push({ sync });
  }

  function bindAll(rootSelector) {
    document.querySelectorAll(`${rootSelector} select`).forEach(bindDropdown);
  }

  function syncAll() {
    bound.forEach(d => d.sync());
  }

  return { bindDropdown, bindAll, syncAll };
})();
