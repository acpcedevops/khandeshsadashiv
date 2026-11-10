'use strict';

(function () {
  const $ = (selector, scope) => (scope || document).querySelector(selector);
  const $$ = (selector, scope) => Array.from((scope || document).querySelectorAll(selector));

  /* ── Mobile nav ─────────────────────────────────────────── */
  const navToggle = $('[data-nav-toggle]');
  const nav = $('#site-nav');
  if (navToggle && nav) {
    navToggle.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', String(open));
    });
  }

  /* ── Search overlay ─────────────────────────────────────── */
  const overlay = $('[data-search-overlay]');
  const searchInput = $('[data-search-input]');
  function openSearch() {
    if (!overlay) return;
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    if (searchInput) {
      searchInput.focus();
      searchInput.select();
    }
  }
  function closeSearch() {
    if (!overlay) return;
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
  }
  $$('[data-search-open]').forEach((btn) => btn.addEventListener('click', openSearch));
  if (overlay) {
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) closeSearch();
    });
    const closeBtn = $('[data-search-close]', overlay);
    if (closeBtn) closeBtn.addEventListener('click', closeSearch);
  }
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeSearch();
    if (event.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) {
      event.preventDefault();
      openSearch();
    }
  });

  /* ── Flash dismiss / auto-hide ──────────────────────────── */
  $$('[data-dismiss]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const alert = btn.closest('.alert');
      if (alert) alert.remove();
    });
  });
  $$('.alert').forEach((alert) => {
    if (!alert.closest('.dash-main')) {
      setTimeout(() => {
        alert.style.transition = 'opacity .4s ease';
        alert.style.opacity = '0';
        setTimeout(() => alert.remove(), 400);
      }, 7000);
    }
  });

  /* ── Confirm destructive actions ────────────────────────── */
  $$('form[data-confirm]').forEach((form) => {
    form.addEventListener('submit', (event) => {
      if (!window.confirm(form.getAttribute('data-confirm'))) event.preventDefault();
    });
  });

  /* ── Copy share link ────────────────────────────────────── */
  $$('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(btn.getAttribute('data-copy') || window.location.href);
        const original = btn.textContent;
        btn.textContent = 'कॉपी झाले ✓';
        setTimeout(() => { btn.textContent = original; }, 1800);
      } catch {
        window.prompt('दुवा कॉपी करा:', btn.getAttribute('data-copy') || window.location.href);
      }
    });
  });

  /* ── Editor toolbar + live preview ──────────────────────── */
  const editor = $('[data-editor]');
  if (editor) {
    const textarea = $('[data-editor-textarea]', editor);
    const preview = $('[data-editor-preview]', editor);
    const csrfMeta = $('meta[name="csrf-token"]');
    const csrf = csrfMeta ? csrfMeta.getAttribute('content') : '';
    let timer = null;

    function wrapSelection(before, after, placeholder) {
      if (!textarea) return;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const value = textarea.value;
      const selected = value.slice(start, end) || placeholder || '';
      textarea.value = value.slice(0, start) + before + selected + after + value.slice(end);
      textarea.focus();
      textarea.selectionStart = start + before.length;
      textarea.selectionEnd = start + before.length + selected.length;
      textarea.dispatchEvent(new Event('input'));
    }

    $$('[data-md]', editor).forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.preventDefault();
        const kind = btn.getAttribute('data-md');
        if (kind === 'bold') wrapSelection('**', '**', 'ठळक मजकूर');
        if (kind === 'italic') wrapSelection('*', '*', 'तिरका मजकूर');
        if (kind === 'h2') wrapSelection('\n## ', '\n', 'उपशीर्षक');
        if (kind === 'h3') wrapSelection('\n### ', '\n', 'छोटे शीर्षक');
        if (kind === 'quote') wrapSelection('\n> ', '\n', 'अवतरण');
        if (kind === 'list') wrapSelection('\n- ', '\n- ', 'मुद्दा');
        if (kind === 'link') wrapSelection('[', '](https://)', 'दुव्याचा मजकूर');
        if (kind === 'hr') wrapSelection('\n---\n', '', '');
      });
    });

    async function updatePreview() {
      if (!textarea || !preview) return;
      try {
        const response = await fetch('/api/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
          body: JSON.stringify({ body_md: textarea.value }),
        });
        const data = await response.json();
        preview.innerHTML = data.ok
          ? '<div class="prose">' + data.html + '</div>'
          : '<p class="muted">पूर्वावलोकन उपलब्ध नाही.</p>';
      } catch {
        preview.innerHTML = '<p class="muted">पूर्वावलोकन लोड होऊ शकले नाही.</p>';
      }
    }

    if (textarea) {
      textarea.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(updatePreview, 400);
        updateCounters();
      });
      if (preview && textarea.value.trim()) updatePreview();
    }

    function updateCounters() {
      $$('[data-counter]').forEach((counter) => {
        const fieldName = counter.getAttribute('data-counter');
        const field = editor.querySelector('[name="' + fieldName + '"]');
        if (!field) return;
        const max = Number(counter.getAttribute('data-max') || 0);
        const length = field.value.length;
        counter.textContent = length + (max ? ' / ' + max : '');
        counter.classList.toggle('over', max > 0 && length > max);
      });
    }
    updateCounters();
  }
})();
