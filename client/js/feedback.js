// =============================================
// feedback.js - /feedback standalone portal
// Deliberately small: build the 1–5 scales, POST JSON, show the done state.
// =============================================
(function () {
  'use strict';

  const form = document.getElementById('fb-form');
  if (!form) return;

  const done = document.getElementById('fb-done');
  const errorBox = document.getElementById('fb-error');
  const submitBtn = document.getElementById('fb-submit');

  // ---- Build each rating scale (radio group rendered as pill buttons) ----
  document.querySelectorAll('.fb-scale').forEach((group) => {
    const name = group.dataset.name;
    const naLabel = group.dataset.na === '0' ? null : group.dataset.na;
    const values = [1, 2, 3, 4, 5];
    if (naLabel) values.push(null);

    values.forEach((v) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = v === null ? naLabel : String(v);
      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-checked', 'false');
      if (v === null) btn.classList.add('fb-na');
      btn.addEventListener('click', () => {
        group.querySelectorAll('button').forEach((b) => {
          b.classList.remove('on');
          b.setAttribute('aria-checked', 'false');
        });
        btn.classList.add('on');
        btn.setAttribute('aria-checked', 'true');
        group.dataset.value = v === null ? 'NA' : String(v);
      });
      group.appendChild(btn);
    });
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-label', group.parentElement.querySelector('.fb-label').textContent.trim());
  });

  // ---- Submit ----
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.classList.add('hidden');

    const payload = {};
    document.querySelectorAll('.fb-scale').forEach((g) => {
      if (g.dataset.value && g.dataset.value !== 'NA') payload[g.dataset.name] = Number(g.dataset.value);
    });
    payload.program = document.getElementById('fb-program').value;
    payload.year_level = document.getElementById('fb-year').value;
    payload.improve = document.getElementById('fb-improve').value;
    payload.bug = document.getElementById('fb-bug').value;
    payload.website = form.elements.website.value; // honeypot

    const hasAnything = Object.keys(payload).some((k) =>
      ['ease', 'accuracy', 'ledger', 'grizz', 'performance', 'improve', 'bug'].includes(k) && payload[k]
    );
    if (!hasAnything) {
      errorBox.textContent = 'Answer at least one question before submitting.';
      errorBox.classList.remove('hidden');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting…';

    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Something went wrong. Please try again.');
      }
      form.classList.add('hidden');
      done.classList.remove('hidden');
      window.scrollTo({ top: 0 });
    } catch (err) {
      errorBox.textContent = err.message || 'Network error. Please try again.';
      errorBox.classList.remove('hidden');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit feedback';
    }
  });
})();
