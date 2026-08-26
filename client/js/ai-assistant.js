// =============================================
// ai-assistant.js — Grizz: COE Mascot AI Assistant
// Clickable-only intelligent academic & financial guide
// =============================================

const GrizzAI = (() => {

  let profile = null;
  let subjects = [];
  let myUnits = [];
  let requirements = [];
  let isOpen = false;
  let activeTab = 'academic';

  const PROGRAM_NAMES = {
    BSCoE: 'BS Computer Engineering',
    BSCE:  'BS Civil Engineering',
    BSECE: 'BS Electronics Engineering',
  };

  // ---- Initialize ----
  async function init() {
    bindEvents();
    renderDashboardWidget();
  }

  function bindEvents() {
    // Launcher button click
    const launcher = document.getElementById('ursa-launcher-btn');
    if (launcher) {
      launcher.addEventListener('click', () => open());
    }

    // Close buttons & overlay
    const closeBtn = document.getElementById('ursa-close-btn');
    const overlay = document.getElementById('ursa-overlay');
    if (closeBtn) closeBtn.addEventListener('click', () => close());
    if (overlay) overlay.addEventListener('click', () => close());

    // Clear chat button
    const clearBtn = document.getElementById('ursa-clear-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => resetChat());
    }

    // Category tabs
    document.querySelectorAll('.ursa-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.ursa-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeTab = btn.dataset.tab;
        renderPromptList();
      });
    });

    // Delegate clicks for prompt cards & dynamic follow-up chips
    document.addEventListener('click', (e) => {
      const promptCard = e.target.closest('.ursa-prompt-card');
      if (promptCard && promptCard.dataset.action) {
        handleAction(promptCard.dataset.action, promptCard.dataset.title || promptCard.textContent.trim());
        return;
      }

      const chip = e.target.closest('.ursa-chip-action');
      if (chip && chip.dataset.action) {
        handleAction(chip.dataset.action, chip.dataset.title || chip.textContent.trim());
        return;
      }

      const dashChip = e.target.closest('.ursa-dash-chip');
      if (dashChip && dashChip.dataset.action) {
        open();
        handleAction(dashChip.dataset.action, dashChip.dataset.title || dashChip.textContent.trim());
        return;
      }

      const navLink = e.target.closest('.ursa-nav-link');
      if (navLink && navLink.dataset.view) {
        close();
        const targetView = navLink.dataset.view;
        const navItem = document.querySelector(`.nav-item[data-view="${targetView}"]`) || document.querySelector(`.bottom-nav-item[data-view="${targetView}"]`);
        if (navItem) navItem.click();
      }
    });
  }

  // ---- Open / Close Drawer ----
  async function open() {
    isOpen = true;
    const drawer = document.getElementById('ursa-drawer');
    const overlay = document.getElementById('ursa-overlay');
    if (drawer) drawer.classList.add('active');
    if (overlay) overlay.classList.add('active');

    // Preload student profile & academic records
    await loadData();
    renderPromptList();
  }

  function close() {
    isOpen = false;
    const drawer = document.getElementById('ursa-drawer');
    const overlay = document.getElementById('ursa-overlay');
    if (drawer) drawer.classList.remove('active');
    if (overlay) overlay.classList.remove('active');
  }

  // ---- Data Loader ----
  async function loadData() {
    try {
      if (!profile) {
        profile = await Auth.getProfile().catch(() => null);
      }
      const prog = profile?.course || 'BSCoE';
      const [checklistRes, unitsRes] = await Promise.all([
        Api.units.checklists(prog).catch(() => ({ subjects: [], requirements: [] })),
        Api.units.my().catch(() => []),
      ]);
      subjects = checklistRes.subjects || [];
      requirements = checklistRes.requirements || [];
      myUnits = unitsRes || [];
    } catch (err) {
      console.warn('Grizz data preload notice:', err);
    }
  }

  // ---- Render Dashboard Embedded Widget ----
  function renderDashboardWidget() {
    const container = document.getElementById('dashboard-ursa-container');
    if (!container) return;

    container.innerHTML = `
      <div class="ursa-dashboard-widget">
        <div class="ursa-dash-left">
          <div class="ursa-dash-avatar">
            <img src="assets/grizz.png" alt="Grizz" />
          </div>
          <div class="ursa-dash-meta">
            <h4>Grizz • COE Mascot AI <span class="ursa-tag-badge">Navigator</span></h4>
            <p>Click any quick prompt to explore your subjects or council funds</p>
          </div>
        </div>
        <div class="ursa-dash-chips">
          <button type="button" class="ursa-dash-chip" data-action="next-sem" data-title="Next Sem Subject Recommendations">
            <iconify-icon icon="icon-park-outline:checklist" style="color:var(--primary);"></iconify-icon> Next Sem Recommendations
          </button>
          <button type="button" class="ursa-dash-chip" data-action="current-subjects" data-title="Ask About Current Subjects">
            <iconify-icon icon="icon-park-outline:book-open" style="color:var(--primary);"></iconify-icon> Current Subjects
          </button>
          <button type="button" class="ursa-dash-chip" data-action="financial-summary" data-title="Explain Financial Summary">
            <iconify-icon icon="icon-park-outline:chart-pie" style="color:var(--primary);"></iconify-icon> Explain Financials
          </button>
        </div>
      </div>
    `;
  }

  // ---- Prompt List (Bottom Drawer) ----
  const PROMPT_DATABASE = {
    academic: [
      {
        action: 'next-sem',
        title: 'Next Sem Subject Recommendations',
        icon: 'icon-park-outline:checklist',
        text: 'Analyze my passed prerequisites and suggest next subjects',
      },
      {
        action: 'current-subjects',
        title: 'Ask About Current Subjects',
        icon: 'icon-park-outline:book-open',
        text: 'Review my enrolled subjects and unlocked senior courses',
      },
      {
        action: 'academic-progress',
        title: 'Academic Progress & Unit Tally',
        icon: 'icon-park-outline:degree-hat',
        text: 'Check units earned vs graduation requirements',
      },
      {
        action: 'check-prereq',
        title: 'Subject Prerequisite Check',
        icon: 'icon-park-outline:mind-mapping',
        text: 'Verify prerequisite dependencies and standing rules',
      },
    ],
    financial: [
      {
        action: 'financial-summary',
        title: 'Explain Financial Dashboard',
        icon: 'icon-park-outline:chart-pie',
        text: 'Plain-English breakdown of collections, expenses & cash balance',
      },
      {
        action: 'upcoming-events',
        title: 'Upcoming Events & Budgets',
        icon: 'icon-park-outline:calendar',
        text: 'Check upcoming COE student activities and fund allocations',
      },
      {
        action: 'recent-spending',
        title: 'Recent Spending Recap',
        icon: 'icon-park-outline:bill',
        text: 'See the latest expenditures from the official ledger',
      },
    ],
    guide: [
      {
        action: 'guide-logging',
        title: 'How to Log My Subjects & Grades',
        icon: 'icon-park-outline:help',
        text: 'Step-by-step guide on tracking credits and marking passed units',
      },
      {
        action: 'guide-transparency',
        title: 'COE Transparency & Auditing',
        icon: 'icon-park-outline:shield',
        text: 'How COE LGU protects student funds and generates financial reports',
      },
    ],
  };

  function renderPromptList() {
    const listEl = document.getElementById('ursa-prompts-list');
    if (!listEl) return;

    const items = PROMPT_DATABASE[activeTab] || PROMPT_DATABASE.academic;
    listEl.innerHTML = items.map(item => `
      <div class="ursa-prompt-card" data-action="${item.action}" data-title="${item.title}">
        <div class="ursa-prompt-left">
          <div class="ursa-prompt-icon"><iconify-icon icon="${item.icon}"></iconify-icon></div>
          <div>
            <div class="ursa-prompt-text">${item.title}</div>
            <div style="font-size:0.7rem;color:var(--text-secondary);">${item.text}</div>
          </div>
        </div>
        <div class="ursa-prompt-arrow"><iconify-icon icon="icon-park-outline:right"></iconify-icon></div>
      </div>
    `).join('');
  }

  // ---- Message Feed Controller ----
  function appendUserMessage(text) {
    const stream = document.getElementById('ursa-chat-stream');
    if (!stream) return;

    const msg = document.createElement('div');
    msg.className = 'ursa-msg user';
    msg.innerHTML = `
      <div class="ursa-msg-avatar">👤</div>
      <div class="ursa-msg-content">
        <div class="ursa-bubble">${esc(text)}</div>
      </div>
    `;
    stream.appendChild(msg);
    scrollToBottom();
  }

  function appendBotMessage(title, htmlContent, followUpChips = []) {
    const stream = document.getElementById('ursa-chat-stream');
    if (!stream) return;

    const msg = document.createElement('div');
    msg.className = 'ursa-msg bot';

    let chipsHtml = '';
    if (followUpChips.length > 0) {
      chipsHtml = `
        <div class="ursa-response-actions">
          ${followUpChips.map(c => `
            <button type="button" class="ursa-chip-action" data-action="${c.action}" data-title="${esc(c.title || c.label)}">
              ${c.icon ? `<iconify-icon icon="${c.icon}"></iconify-icon>` : '💡'} ${esc(c.label)}
            </button>
          `).join('')}
        </div>
      `;
    }

    msg.innerHTML = `
      <div class="ursa-msg-avatar">
        <img src="assets/grizz.png" alt="Grizz" />
      </div>
      <div class="ursa-msg-content">
        <div class="ursa-bubble">
          <h4><iconify-icon icon="icon-park-outline:sparkles"></iconify-icon> ${esc(title)}</h4>
          ${htmlContent}
          ${chipsHtml}
        </div>
      </div>
    `;
    stream.appendChild(msg);
    scrollToBottom();
  }

  function scrollToBottom() {
    const body = document.getElementById('ursa-body');
    if (body) {
      setTimeout(() => {
        body.scrollTop = body.scrollHeight;
      }, 50);
    }
  }

  function resetChat() {
    const stream = document.getElementById('ursa-chat-stream');
    if (!stream) return;

    const studentName = profile?.full_name ? profile.full_name.split(' ')[0] : 'Student';
    const progName = PROGRAM_NAMES[profile?.course] || profile?.course || 'Engineering';

    stream.innerHTML = `
      <div class="ursa-msg bot">
        <div class="ursa-msg-avatar">
          <img src="assets/grizz.png" alt="Grizz" />
        </div>
        <div class="ursa-msg-content">
          <div class="ursa-bubble">
            <h4>👋 Roar! Hello, ${esc(studentName)}!</h4>
            <p>I'm <strong>Grizz</strong>, your official College of Engineering companion. I can analyze your <strong>${esc(progName)}</strong> subjects, recommend your next semester load, or explain the LGU's financial records.</p>
            <p style="color:var(--text-secondary);font-size:0.78rem;">Click any prompt card below or quick action to start!</p>
          </div>
        </div>
      </div>
    `;
    scrollToBottom();
  }

  // ---- Query Handlers (Zero Typing / 100% Deterministic) ----
  async function handleAction(action, userLabel) {
    appendUserMessage(userLabel || action);
    await loadData();

    switch (action) {
      case 'next-sem':
        handleNextSemRecommendations();
        break;
      case 'current-subjects':
        handleCurrentSubjects();
        break;
      case 'academic-progress':
        handleAcademicProgress();
        break;
      case 'check-prereq':
        handleCheckPrerequisites();
        break;
      case 'financial-summary':
        await handleFinancialSummary();
        break;
      case 'upcoming-events':
        await handleUpcomingEvents();
        break;
      case 'recent-spending':
        await handleRecentSpending();
        break;
      case 'guide-logging':
        handleGuideLogging();
        break;
      case 'guide-transparency':
        handleGuideTransparency();
        break;
      default:
        appendBotMessage('Grizz Navigator', `<p>I have ready-to-use insights for this inquiry!</p>`);
        break;
    }
  }

  // 1. Next Semester Subject Recommendations
  function handleNextSemRecommendations() {
    const prog = profile?.course || 'BSCoE';
    const progTitle = PROGRAM_NAMES[prog] || prog;

    // Passed subject codes set
    const passedCodes = new Set();
    const enrolledCodes = new Set();

    myUnits.forEach(u => {
      const code = u.subjects?.code || '';
      if (u.status === 'passed') passedCodes.add(code.trim().toUpperCase());
      if (u.status === 'enrolled') enrolledCodes.add(code.trim().toUpperCase());
    });

    // Determine student's year level & prospective semester
    const currentYear = Number(profile?.year_level) || 1;
    
    // Find unpassed subjects in prospectus
    const unpassed = subjects.filter(s => {
      const c = s.code.trim().toUpperCase();
      return !passedCodes.has(c);
    });

    // Check prerequisites for eligible candidates
    const eligible = [];
    const blockedByPrereq = [];

    unpassed.forEach(s => {
      const isCurrentlyEnrolled = enrolledCodes.has(s.code.trim().toUpperCase());
      const prereqStr = (s.prerequisites || '').trim();

      if (!prereqStr || prereqStr === 'None' || prereqStr === '-') {
        eligible.push({ ...s, isCurrentlyEnrolled, missingPrereq: null });
        return;
      }

      // Check if prereq has standing requirement e.g. "2nd Yr Standing"
      const standingMatch = prereqStr.match(/(\d+)(?:st|nd|rd|th)?\s*Yr\s*Standing/i);
      if (standingMatch) {
        const requiredYr = Number(standingMatch[1]);
        if (currentYear < requiredYr) {
          blockedByPrereq.push({ ...s, reason: `Requires Year ${requiredYr} standing (Currently Year ${currentYear})` });
          return;
        }
      }

      // Check individual subject codes separated by comma, semicolon or slash
      const rawTokens = prereqStr.split(/[;,/]/).map(t => t.replace(/co-req/i, '').trim()).filter(Boolean);
      let satisfies = true;
      let missing = [];

      rawTokens.forEach(token => {
        const normToken = token.trim().toUpperCase();
        if (normToken && !normToken.includes('STANDING') && !passedCodes.has(normToken)) {
          if (/^[A-Z0-9\s-]+$/.test(normToken)) {
            satisfies = false;
            missing.push(token.trim());
          }
        }
      });

      if (satisfies) {
        eligible.push({ ...s, isCurrentlyEnrolled, missingPrereq: null });
      } else {
        blockedByPrereq.push({ ...s, reason: `Missing prerequisite: ${missing.join(', ')}` });
      }
    });

    // Sort eligible by year level and semester
    eligible.sort((a, b) => a.year_level - b.year_level || a.semester - b.semester);

    // Take top ~6-8 subjects up to ~24 units
    let totalUnits = 0;
    const recommended = [];
    for (const s of eligible) {
      if (totalUnits + s.units <= 24 || recommended.length < 5) {
        recommended.push(s);
        totalUnits += s.units;
      }
    }

    if (recommended.length === 0) {
      appendBotMessage(
        'Curriculum Recommendations',
        `<p>🎉 Exceptional work! You have completed all prerequisite-cleared subjects for <strong>${esc(progTitle)}</strong>!</p>`,
        [
          { action: 'academic-progress', label: 'View Progress Summary', icon: 'icon-park-outline:degree-hat' },
        ]
      );
      return;
    }

    const cardsHtml = recommended.map(s => `
      <div class="ursa-subject-item">
        <div class="ursa-subject-meta">
          <span class="ursa-subject-code">${esc(s.code)} · ${s.units} Units</span>
          <span class="ursa-subject-title" title="${esc(s.title)}">${esc(s.title)}</span>
        </div>
        <span class="ursa-subject-badge ${s.isCurrentlyEnrolled ? 'prereq' : ''}">
          ${s.isCurrentlyEnrolled ? 'Enrolled' : `Yr ${s.year_level} Sem ${s.semester}`}
        </span>
      </div>
    `).join('');

    const html = `
      <p>Based on your <strong>${esc(progTitle)}</strong> prospectus and passed prerequisites, here is your recommended subject load:</p>
      
      <div class="ursa-stat-highlight">
        <div class="ursa-stat-box">
          <div class="ursa-stat-box-val">${recommended.length}</div>
          <div class="ursa-stat-box-lbl">Recommended Subjects</div>
        </div>
        <div class="ursa-stat-box">
          <div class="ursa-stat-box-val">${totalUnits} Units</div>
          <div class="ursa-stat-box-lbl">Total Academic Load</div>
        </div>
      </div>

      <div class="ursa-card-list">
        ${cardsHtml}
      </div>

      <p style="font-size:0.75rem;color:var(--text-secondary);margin-top:0.5rem;">
        📌 Tip: You can log your actual enrollment grades directly in the <strong>Academic Progress</strong> tab.
      </p>
    `;

    appendBotMessage('Next Sem Subject Recommendations', html, [
      { action: 'academic-progress', label: 'Academic Progress Tally', icon: 'icon-park-outline:degree-hat' },
      { action: 'check-prereq', label: 'Check Prerequisites', icon: 'icon-park-outline:mind-mapping' },
    ]);
  }

  // 2. Ask About Current Subjects
  function handleCurrentSubjects() {
    const enrolled = myUnits.filter(u => u.status === 'enrolled');

    if (enrolled.length === 0) {
      appendBotMessage(
        'Current Subjects',
        `
          <p>You do not have any subjects marked as <strong>Enrolled</strong> right now.</p>
          <p>Head to the <a href="#" class="ursa-nav-link" data-view="units" style="color:var(--primary);font-weight:600;">Academic Progress tab</a> to add your current semester subjects!</p>
        `,
        [
          { action: 'next-sem', label: 'Recommended Subjects', icon: 'icon-park-outline:checklist' },
          { action: 'guide-logging', label: 'How to Log Subjects', icon: 'icon-park-outline:help' },
        ]
      );
      return;
    }

    const totalUnits = enrolled.reduce((acc, u) => acc + (Number(u.subjects?.units) || 0), 0);

    const cardsHtml = enrolled.map(u => `
      <div class="ursa-subject-item">
        <div class="ursa-subject-meta">
          <span class="ursa-subject-code">${esc(u.subjects?.code || 'Subject')} · ${u.subjects?.units || 0} Units</span>
          <span class="ursa-subject-title">${esc(u.subjects?.title || '')}</span>
        </div>
        <span class="ursa-subject-badge prereq">SY ${esc(u.school_year)}</span>
      </div>
    `).join('');

    const html = `
      <p>Here are your active subjects currently in progress:</p>
      
      <div class="ursa-stat-highlight">
        <div class="ursa-stat-box">
          <div class="ursa-stat-box-val">${enrolled.length}</div>
          <div class="ursa-stat-box-lbl">Active Subjects</div>
        </div>
        <div class="ursa-stat-box">
          <div class="ursa-stat-box-val">${totalUnits} Units</div>
          <div class="ursa-stat-box-lbl">Current Term Load</div>
        </div>
      </div>

      <div class="ursa-card-list">
        ${cardsHtml}
      </div>

      <p style="font-size:0.75rem;color:var(--text-secondary);">
        🌟 Passing these subjects will unlock your upcoming major courses in the next semester!
      </p>
    `;

    appendBotMessage('Current Enrolled Subjects', html, [
      { action: 'next-sem', label: 'Next Sem Subjects', icon: 'icon-park-outline:checklist' },
      { action: 'academic-progress', label: 'Full Progress Summary', icon: 'icon-park-outline:degree-hat' },
    ]);
  }

  // 3. Academic Progress & Units
  function handleAcademicProgress() {
    const prog = profile?.course || 'BSCoE';
    const progTitle = PROGRAM_NAMES[prog] || prog;

    const req = requirements.find(r => r.program === prog) || { total_units: 189, total_subjects: 67 };
    const passed = myUnits.filter(u => u.status === 'passed');
    const passedUnits = passed.reduce((acc, u) => acc + (Number(u.subjects?.units) || 0), 0);
    const pct = Math.min(100, Math.round((passedUnits / (req.total_units || 1)) * 100));

    const failed = myUnits.filter(u => u.status === 'failed' || u.status === 'dropped');

    let backlogNote = '';
    if (failed.length > 0) {
      backlogNote = `
        <div style="margin-top:0.65rem;padding:0.6rem 0.75rem;background:rgba(239, 68, 68, 0.1);border:1px solid rgba(239, 68, 68, 0.25);border-radius:6px;font-size:0.78rem;color:#FCA5A5;">
          ⚠️ <strong>Backlog Notice:</strong> You have ${failed.length} subject(s) marked as Failed or Dropped. Check your prerequisites to retake them before senior year.
        </div>
      `;
    }

    const html = `
      <p>Here is your overall completion towards your <strong>${esc(progTitle)}</strong> degree:</p>
      
      <div class="ursa-stat-highlight">
        <div class="ursa-stat-box">
          <div class="ursa-stat-box-val">${passedUnits} / ${req.total_units}</div>
          <div class="ursa-stat-box-lbl">Units Completed</div>
        </div>
        <div class="ursa-stat-box">
          <div class="ursa-stat-box-val" style="color:#22C55E;">${pct}%</div>
          <div class="ursa-stat-box-lbl">Degree Progress</div>
        </div>
      </div>

      <div style="background:rgba(255,255,255,0.06);border-radius:100px;height:8px;overflow:hidden;margin:0.5rem 0;">
        <div style="width:${pct}%;background:linear-gradient(90deg, #F97316, #22C55E);height:100%;border-radius:100px;transition:width 0.5s ease;"></div>
      </div>

      ${backlogNote}
    `;

    appendBotMessage('Academic Progress & Degree Tally', html, [
      { action: 'next-sem', label: 'Next Sem Recommendations', icon: 'icon-park-outline:checklist' },
      { action: 'current-subjects', label: 'View Enrolled Subjects', icon: 'icon-park-outline:book-open' },
    ]);
  }

  // 4. Prerequisite Checker
  function handleCheckPrerequisites() {
    const prog = profile?.course || 'BSCoE';
    const withPrereqs = subjects.filter(s => s.prerequisites && s.prerequisites !== 'None' && s.prerequisites !== '-');

    const sample = withPrereqs.slice(0, 5);

    const cardsHtml = sample.map(s => `
      <div class="ursa-subject-item">
        <div class="ursa-subject-meta">
          <span class="ursa-subject-code">${esc(s.code)} (${s.units}u)</span>
          <span class="ursa-subject-title">${esc(s.title)}</span>
        </div>
        <span class="ursa-subject-badge prereq" title="${esc(s.prerequisites)}">
          Req: ${esc(s.prerequisites)}
        </span>
      </div>
    `).join('');

    const html = `
      <p>Subjects in your curriculum often require foundational courses to be passed first. Here is a sample of prerequisite chains:</p>
      
      <div class="ursa-card-list">
        ${cardsHtml}
      </div>

      <p style="font-size:0.75rem;color:var(--text-secondary);">
        💡 Grizz automatically checks all these requirements when computing your <strong>Next Sem Recommendations</strong>!
      </p>
    `;

    appendBotMessage('Subject Prerequisites Engine', html, [
      { action: 'next-sem', label: 'Get My Recommendations', icon: 'icon-park-outline:checklist' },
      { action: 'academic-progress', label: 'Check My Passed Units', icon: 'icon-park-outline:degree-hat' },
    ]);
  }

  // 5. Financial Summary Explainer
  async function handleFinancialSummary() {
    try {
      const summary = await Api.reports.summary();
      const incomeStr = UI.currency(summary.totalIncome);
      const expenseStr = UI.currency(summary.totalExpense);
      const balanceStr = UI.currency(summary.remainingBalance);
      const reservedStr = UI.currency(summary.breakdown.reserved_envelopes);

      const html = `
        <p>Here is an easy-to-understand breakdown of our College of Engineering LGU finances:</p>
        
        <div class="ursa-stat-highlight">
          <div class="ursa-stat-box">
            <div class="ursa-stat-box-val" style="color:#22C55E;">${incomeStr}</div>
            <div class="ursa-stat-box-lbl">Total Funds In</div>
          </div>
          <div class="ursa-stat-box">
            <div class="ursa-stat-box-val" style="color:#EF4444;">${expenseStr}</div>
            <div class="ursa-stat-box-lbl">Total Expenses</div>
          </div>
        </div>

        <div style="padding:0.75rem;background:rgba(0,0,0,0.25);border:1px solid var(--border);border-radius:8px;margin:0.5rem 0;font-size:0.8rem;line-height:1.4;">
          <div style="display:flex;justify-content:space-between;margin-bottom:0.35rem;">
            <span>💵 Available Unreserved Cash:</span>
            <strong style="color:var(--primary);">${balanceStr}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;color:var(--text-secondary);font-size:0.74rem;">
            <span>🎯 Reserved for Events:</span>
            <span>${reservedStr}</span>
          </div>
        </div>

        <p style="font-size:0.75rem;color:var(--text-secondary);">
          Every peso is audited and transparently recorded in the official COE ledger.
        </p>
      `;

      appendBotMessage('COE Financial Summary Breakdown', html, [
        { action: 'upcoming-events', label: 'View Event Budgets', icon: 'icon-park-outline:calendar' },
        { action: 'recent-spending', label: 'Recent Spending', icon: 'icon-park-outline:bill' },
      ]);
    } catch (err) {
      appendBotMessage('Financial Overview', `<p>Could not fetch financial records at this time.</p>`);
    }
  }

  // 6. Upcoming Events & Budgets
  async function handleUpcomingEvents() {
    try {
      const events = await Api.events.list();
      const active = (events || []).filter(e => !e.is_archived).slice(0, 4);

      if (active.length === 0) {
        appendBotMessage('Upcoming Events', `<p>There are no active upcoming events scheduled right now.</p>`);
        return;
      }

      const cardsHtml = active.map(e => `
        <div class="ursa-subject-item">
          <div class="ursa-subject-meta">
            <span class="ursa-subject-code">${esc(e.title)}</span>
            <span class="ursa-subject-title">${UI.dateStr(e.event_date || e.created_at)}</span>
          </div>
          <span class="ursa-subject-badge">${UI.currency(e.allocated_budget || 0)}</span>
        </div>
      `).join('');

      const html = `
        <p>Here are the upcoming College of Engineering activities and allocated budgets:</p>
        <div class="ursa-card-list">
          ${cardsHtml}
        </div>
      `;

      appendBotMessage('Upcoming Events & Allocated Budgets', html, [
        { action: 'financial-summary', label: 'Financial Summary', icon: 'icon-park-outline:chart-pie' },
        { action: 'recent-spending', label: 'Recent Spending', icon: 'icon-park-outline:bill' },
      ]);
    } catch (err) {
      appendBotMessage('Upcoming Events', `<p>Could not load events list.</p>`);
    }
  }

  // 7. Recent Spending Recap
  async function handleRecentSpending() {
    try {
      const txs = await Api.transactions.list({ limit: 4 });
      const expenses = (txs || []).filter(t => t.type === 'expense');

      if (expenses.length === 0) {
        appendBotMessage('Recent Spending', `<p>No expense transactions found in recent history.</p>`);
        return;
      }

      const cardsHtml = expenses.map(t => `
        <div class="ursa-subject-item">
          <div class="ursa-subject-meta">
            <span class="ursa-subject-code">${esc(t.description || 'Expense')}</span>
            <span class="ursa-subject-title">${UI.dateStr(t.transaction_date)}</span>
          </div>
          <span class="ursa-subject-badge prereq" style="color:#F87171;border-color:rgba(239,68,68,0.25);">
            -${UI.currency(t.amount)}
          </span>
        </div>
      `).join('');

      const html = `
        <p>Here are the latest recorded expenditures from the council ledger:</p>
        <div class="ursa-card-list">
          ${cardsHtml}
        </div>
      `;

      appendBotMessage('Recent Expense Transactions', html, [
        { action: 'financial-summary', label: 'Financial Overview', icon: 'icon-park-outline:chart-pie' },
        { action: 'upcoming-events', label: 'Upcoming Events', icon: 'icon-park-outline:calendar' },
      ]);
    } catch (err) {
      appendBotMessage('Recent Spending', `<p>Could not load recent transactions.</p>`);
    }
  }

  // 8. Guide - How to Log Units
  function handleGuideLogging() {
    const html = `
      <p>Tracking your credit units in the portal takes just 3 simple steps:</p>
      <ol style="padding-left:1.15rem;font-size:0.8rem;line-height:1.6;margin:0.5rem 0;">
        <li>Navigate to the <strong>Academic Progress</strong> tab.</li>
        <li>Click <strong>+ Log Subject</strong> to record a course from your curriculum.</li>
        <li>Select the <strong>School Year</strong>, <strong>Semester</strong>, and set the status to <em>Passed</em> with your final numerical grade (e.g. 1.50).</li>
      </ol>
      <p style="font-size:0.75rem;color:var(--text-secondary);">
        Grizz uses these logged grades to automatically unlock your prerequisite-cleared subjects!
      </p>
    `;

    appendBotMessage('How to Log Subjects Guide', html, [
      { action: 'next-sem', label: 'See Recommendations', icon: 'icon-park-outline:checklist' },
      { action: 'academic-progress', label: 'Check Progress', icon: 'icon-park-outline:degree-hat' },
    ]);
  }

  // 9. Guide - Transparency & Auditing
  function handleGuideTransparency() {
    const html = `
      <p>The College of Engineering LGU portal ensures complete financial transparency:</p>
      <ul style="padding-left:1.15rem;font-size:0.8rem;line-height:1.6;margin:0.5rem 0;">
        <li><strong>Real-time Ledger:</strong> All collections, donations, and expenses are logged with official receipt references.</li>
        <li><strong>Audited Reports:</strong> Students can review monthly balance sheets and event breakdown summaries at any time in the <strong>Reports</strong> tab.</li>
        <li><strong>Encrypted Records:</strong> Immutable audit logs ensure budget transfers and updates cannot be tampered with.</li>
      </ul>
    `;

    appendBotMessage('COE Financial Transparency', html, [
      { action: 'financial-summary', label: 'Check Funds', icon: 'icon-park-outline:chart-pie' },
      { action: 'upcoming-events', label: 'Event Budgets', icon: 'icon-park-outline:calendar' },
    ]);
  }

  function esc(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  return {
    init,
    open,
    close,
    handleAction,
    renderDashboardWidget,
  };
})();

// Provide aliases for global access
window.GrizzAI = GrizzAI;
window.UrsaAI = GrizzAI;
