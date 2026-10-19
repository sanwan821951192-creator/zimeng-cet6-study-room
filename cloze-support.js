'use strict';

/* Word-bank helpers only; answer snapshots come from app.js, never from storage. */
window.ClozeSupport = (() => {
  const openByScope = new Map();
  const itemSelector = 'details[data-cloze-support-item]';
  const bankSelector = 'section[data-cloze-support-bank]';

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
  }

  function openItems(scope) {
    if (!openByScope.has(scope)) openByScope.set(scope, new Set());
    return openByScope.get(scope);
  }

  function remember(details) {
    const scope = details.dataset.clozeSupportScope;
    const item = details.dataset.clozeSupportItem;
    if (scope === undefined || item === undefined) return;
    const current = openItems(scope);
    if (details.open) current.add(item);
    else current.delete(item);
  }

  function snapshotVisibleItems() {
    // A native toggle event is queued. Read the DOM before app.js replaces it.
    document.querySelectorAll(itemSelector).forEach(remember);
  }

  function updateSummary(details) {
    const summary = details.querySelector('summary');
    if (!summary) return;
    const action = details.open ? '收起中文' : '显示中文';
    summary.textContent = action;
    summary.setAttribute('aria-label', action + '：' + details.dataset.clozeSupportLabel);
  }

  function updateAllButton(bank) {
    const items = [...bank.querySelectorAll(itemSelector)];
    const button = bank.querySelector('button[data-cloze-support-all]');
    if (!button) return;
    const allOpen = items.length > 0 && items.every(item => item.open);
    button.textContent = allOpen ? '全部收起中文' : '全部显示中文';
    button.setAttribute('aria-pressed', String(allOpen));
  }

  function usageForAnswers(answers) {
    const usage = new Map();
    if (!answers || typeof answers !== 'object') return usage;
    for (const [number, value] of Object.entries(answers)) {
      // The caller passes question numbers, never complete localStorage keys.
      if (!/^[1-9]\d*$/.test(number) || typeof value !== 'string' || !value) continue;
      if (!usage.has(value)) usage.set(value, []);
      usage.get(value).push(number);
    }
    for (const numbers of usage.values()) numbers.sort((left, right) => Number(left) - Number(right));
    return usage;
  }

  function usageText(numbers) {
    return numbers.length ? '已选 ' + numbers.join('、') : '';
  }

  function scopeFor(lesson, date) {
    return JSON.stringify([String(date), String(lesson.id ?? '')]);
  }

  function syncAnswers(lesson, {date = '', answers = {}} = {}) {
    if (!lesson) return 0;
    const scope = scopeFor(lesson, date);
    const usage = usageForAnswers(answers);
    let updated = 0;
    document.querySelectorAll(bankSelector).forEach(bank => {
      if (bank.dataset.clozeSupportBank !== scope) return;
      for (const item of bank.querySelectorAll('[data-cloze-support-choice]')) {
        const numbers = usage.get(item.dataset.clozeSupportChoice) || [];
        item.classList.toggle('is-used', numbers.length > 0);
        const badge = item.querySelector('.cloze-bank-used');
        if (!badge) continue;
        // Keep the English span and any StudyMarks ranges completely intact.
        badge.textContent = usageText(numbers);
        badge.hidden = numbers.length === 0;
      }
      updated++;
    });
    return updated;
  }

  function renderBank(lesson, {date = '', answers = {}} = {}) {
    if (!Array.isArray(lesson?.wordBank) || !lesson.wordBank.length) return '';
    snapshotVisibleItems();
    const scope = scopeFor(lesson, date);
    const current = openItems(scope);
    const usage = usageForAnswers(answers);
    const entries = lesson.wordBank.map((entry, index) => {
      const letter = String(entry.letter ?? '');
      const word = String(entry.word ?? '');
      return {
        letter, word,
        meaning: String(entry.zh || entry.meaning || '暂无中文释义'),
        key: JSON.stringify([index, letter, word]),
        label: letter + '. ' + word
      };
    });
    const allOpen = entries.every(entry => current.has(entry.key));
    return `<section class="word-bank cloze-support-bank" data-cloze-support-bank="${escapeHtml(scope)}" aria-label="选词填空词库">
      <header class="cloze-bank-toolbar"><h3>词库</h3><button type="button" class="small-button cloze-bank-all" data-cloze-support-all aria-pressed="${allOpen}">${allOpen ? '全部收起中文' : '全部显示中文'}</button></header>
      <div class="cloze-bank-grid">${entries.map(entry => {
        const isOpen = current.has(entry.key);
        const action = isOpen ? '收起中文' : '显示中文';
        const numbers = usage.get(entry.letter) || [];
        // Only the English span matches StudyMarks' existing .word-bank span scope.
        return `<div class="cloze-bank-item${numbers.length ? ' is-used' : ''}" data-cloze-support-choice="${escapeHtml(entry.letter)}"><span class="cloze-bank-en"><b>${escapeHtml(entry.letter)}.</b> ${escapeHtml(entry.word)}</span><small class="cloze-bank-used" role="status" aria-live="polite"${numbers.length ? '' : ' hidden'}>${escapeHtml(usageText(numbers))}</small><details class="cloze-bank-meaning" data-cloze-support-scope="${escapeHtml(scope)}" data-cloze-support-item="${escapeHtml(entry.key)}" data-cloze-support-label="${escapeHtml(entry.label)}"${isOpen ? ' open' : ''}><summary aria-label="${escapeHtml(action + '：' + entry.label)}">${action}</summary><p class="cloze-bank-zh" lang="zh-CN">${escapeHtml(entry.meaning)}</p></details></div>`;
      }).join('')}</div>
    </section>`;
  }

  // toggle does not bubble, so use capture for native pointer and keyboard actions.
  document.addEventListener('toggle', event => {
    const details = event.target;
    if (!details?.matches?.(itemSelector) || details.isConnected === false) return;
    remember(details);
    updateSummary(details);
    const bank = details.closest(bankSelector);
    if (bank) updateAllButton(bank);
  }, true);

  document.addEventListener('click', event => {
    const button = event.target.closest?.('button[data-cloze-support-all]');
    if (!button) return;
    const bank = button.closest(bankSelector);
    if (!bank) return;
    event.preventDefault();
    const items = [...bank.querySelectorAll(itemSelector)];
    const shouldOpen = !items.every(item => item.open);
    for (const details of items) {
      details.open = shouldOpen;
      remember(details);
      updateSummary(details);
    }
    updateAllButton(bank);
  });

  return Object.freeze({renderBank, syncAnswers});
})();
