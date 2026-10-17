'use strict';

/* Optional word meanings only; answers and learning records are never read here. */
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

  function renderBank(lesson, {date = ''} = {}) {
    if (!Array.isArray(lesson?.wordBank) || !lesson.wordBank.length) return '';
    snapshotVisibleItems();
    const scope = JSON.stringify([String(date), String(lesson.id ?? '')]);
    const current = openItems(scope);
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
        // Only the English span matches StudyMarks' existing .word-bank span scope.
        return `<div class="cloze-bank-item"><span class="cloze-bank-en"><b>${escapeHtml(entry.letter)}.</b> ${escapeHtml(entry.word)}</span><details class="cloze-bank-meaning" data-cloze-support-scope="${escapeHtml(scope)}" data-cloze-support-item="${escapeHtml(entry.key)}" data-cloze-support-label="${escapeHtml(entry.label)}"${isOpen ? ' open' : ''}><summary aria-label="${escapeHtml(action + '：' + entry.label)}">${action}</summary><p class="cloze-bank-zh" lang="zh-CN">${escapeHtml(entry.meaning)}</p></details></div>`;
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

  return Object.freeze({renderBank});
})();
