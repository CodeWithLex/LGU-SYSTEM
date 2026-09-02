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

    function positionMenu() {
      const rect = trigger.getBoundingClientRect();
      const menuHeight = Math.min(menu.scrollHeight || 180, 180);
      const spaceBelow = window.innerHeight - rect.bottom;
      const viewportWidth = window.innerWidth;

      const width = Math.min(rect.width, viewportWidth - 16);
      let left = Math.max(8, rect.left);
      if (left + width > viewportWidth - 8) {
        left = Math.max(8, viewportWidth - width - 8);
      }

      menu.style.position = 'fixed';
      menu.style.left = `${left}px`;
      menu.style.width = `${width}px`;
      menu.style.minWidth = `${width}px`;
      menu.style.maxWidth = `${viewportWidth - 16}px`;
      menu.style.right = 'auto';
      menu.style.zIndex = '999999';

      if (spaceBelow < menuHeight + 10 && rect.top > menuHeight + 10) {
        menu.style.top = 'auto';
        menu.style.bottom = `${window.innerHeight - rect.top + 6}px`;
      } else {
        menu.style.bottom = 'auto';
        menu.style.top = `${rect.bottom + 6}px`;
      }
    }

    function open() {
      buildMenu(); // rebuild so dynamically-added options appear
      positionMenu();
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
      if (!dd.contains(e.target) && !menu.contains(e.target)) close();
    });

    document.addEventListener('touchstart', e => {
      if (!dd.contains(e.target) && !menu.contains(e.target)) close();
    }, { passive: true });

    window.addEventListener('scroll', e => {
      if (!dd.classList.contains('dd-open')) return;
      // Do NOT close if scrolling inside the dropdown choices list itself!
      if (e.target === menu || (e.target && menu.contains(e.target))) return;
      positionMenu();
    }, { capture: true, passive: true });

    window.addEventListener('resize', () => {
      if (dd.classList.contains('dd-open')) positionMenu();
    }, { passive: true });

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
