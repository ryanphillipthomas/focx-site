(function () {
  'use strict';

  var GENERIC_ERROR = 'Something went wrong. Try again in a moment.';
  var INVALID_EMAIL = 'Enter a valid email';
  var INFO_ICON =
    '<svg class="error-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><circle cx="8" cy="8" r="8" fill="currentColor"/><path fill="var(--bg)" d="M8.75 6.85v4.4c0 .41-.34.75-.75.75s-.75-.34-.75-.75v-4.4c0-.41.34-.75.75-.75s.75.34.75.75z"/><circle cx="8" cy="4.35" r="1.05" fill="var(--bg)"/></svg>';

  var form = document.getElementById('waitlist-form');
  var emailInput = document.getElementById('email');
  var websiteInput = document.getElementById('website');
  var submitButton = document.getElementById('waitlist-submit');
  var errorEl = document.getElementById('email-error');
  var signup = document.getElementById('signup');
  var confirmView = document.getElementById('confirm');
  var confirmHeadline = document.getElementById('confirm-headline');

  if (!form || !emailInput || !submitButton || !errorEl) return;

  function waitlistUrl() {
    var cfg = window.FOCX_WAITLIST || {};
    var endpoint = cfg.endpoint || '/api/waitlist';
    if (/^https?:\/\//i.test(endpoint)) return endpoint;
    var previewBase = String(cfg.previewBase || '').replace(/\/$/, '');
    var previewReady = previewBase && !/REPLACE_ME/i.test(previewBase);
    if (previewReady && /\.onrender\.com$/i.test(location.hostname)) {
      return previewBase + '/api/waitlist';
    }
    return endpoint;
  }

  function isValidEmail(value) {
    var email = String(value || '').trim();
    if (!email || email.length > 254) return false;
    var at = email.indexOf('@');
    if (at < 1 || at !== email.lastIndexOf('@')) return false;
    var domain = email.slice(at + 1);
    if (domain.indexOf('.') < 1) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function clearError() {
    errorEl.replaceChildren();
    emailInput.removeAttribute('aria-invalid');
    emailInput.removeAttribute('aria-describedby');
  }

  function showError(message) {
    errorEl.innerHTML = INFO_ICON + '<span>' + message + '</span>';
    emailInput.setAttribute('aria-invalid', 'true');
    emailInput.setAttribute('aria-describedby', 'email-error');
  }

  function setPending(pending) {
    submitButton.disabled = pending;
    emailInput.disabled = pending;
    submitButton.textContent = pending ? 'Joining…' : 'Join the waitlist';
  }

  function showConfirmation() {
    signup.hidden = true;
    confirmView.hidden = false;
    if (confirmHeadline) confirmHeadline.focus();
  }

  async function messageForResponse(res) {
    if (res.status === 400) {
      var text = '';
      try {
        text = await res.text();
      } catch (e) {
        text = '';
      }
      if (/invalid_email/i.test(text)) return INVALID_EMAIL;
    }
    return GENERIC_ERROR;
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (submitButton.disabled) return;

    clearError();
    var email = emailInput.value.trim();
    if (!isValidEmail(email)) {
      showError(INVALID_EMAIL);
      return;
    }

    setPending(true);

    fetch(waitlistUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'omit',
      body: JSON.stringify({
        email: email,
        website: websiteInput ? websiteInput.value : '',
      }),
    })
      .then(function (res) {
        if (res.status === 200) {
          showConfirmation();
          return;
        }
        return messageForResponse(res).then(showError);
      })
      .catch(function () {
        showError(GENERIC_ERROR);
      })
      .then(function () {
        if (!confirmView.hidden) return;
        setPending(false);
      });
  });
})();
