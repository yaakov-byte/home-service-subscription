// ═══════════════════════════════════════════
// CONFIGURATION — Replace with your real keys
// ═══════════════════════════════════════════
const SPREEDLY_ENV_KEY = '2WA2710BBN8AZ81PNAA38W09K5'; // Public key, safe for frontend
const BACKEND_URL = '/.netlify/functions'; // Netlify Functions endpoint

// ═══════════════════════════════════════════
// Initialize Spreedly iFrame
// ═══════════════════════════════════════════
Spreedly.init(SPREEDLY_ENV_KEY, {
  'numberEl': 'spreedly-number',
  'cvvEl': 'spreedly-cvv'
});

Spreedly.on('ready', function () {
  Spreedly.setFieldType('number', 'text');
  Spreedly.setFieldType('cvv', 'text');
  Spreedly.setNumberFormat('prettyFormat');
  Spreedly.setStyle('number', 'font-size: 16px; font-family: "DM Sans", sans-serif; color: #1a1f2e; padding: 8px;');
  Spreedly.setStyle('cvv', 'font-size: 16px; font-family: "DM Sans", sans-serif; color: #1a1f2e; padding: 8px;');
});

// ═══════════════════════════════════════════
// Form Logic
// ═══════════════════════════════════════════
const submitBtn = document.getElementById('submit-btn');
const consentCheck = document.getElementById('consent-check');
const statusMsg = document.getElementById('status-msg');

consentCheck.addEventListener('change', () => {
  submitBtn.disabled = !consentCheck.checked;
});

submitBtn.addEventListener('click', async (e) => {
  e.preventDefault();

  const firstName = document.getElementById('first-name').value.trim();
  const lastName = document.getElementById('last-name').value.trim();
  const email = document.getElementById('email').value.trim();
  const phone = document.getElementById('phone').value.trim();
  const expMonth = document.getElementById('exp-month').value.trim();
  const expYear = document.getElementById('exp-year').value.trim();

  // Basic validation
  if (!firstName || !lastName || !email || !phone || !expMonth || !expYear) {
    showStatus('Please fill in all fields.', 'error');
    return;
  }

  if (!consentCheck.checked) {
    showStatus('Please agree to the terms before proceeding.', 'error');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Processing…';
  hideStatus();

  // Tokenize card via Spreedly iFrame
  Spreedly.tokenizeCreditCard({
    first_name: firstName,
    last_name: lastName,
    email: email,
    month: expMonth,
    year: '20' + expYear
  });
});

// ═══════════════════════════════════════════
// Spreedly Callbacks
// ═══════════════════════════════════════════
Spreedly.on('paymentMethod', async function (token, pmData) {
  // Card tokenized successfully — send to backend
  try {
    const response = await fetch(`${BACKEND_URL}/process-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payment_method_token: token,
        email: document.getElementById('email').value.trim(),
        phone: document.getElementById('phone').value.trim(),
        first_name: document.getElementById('first-name').value.trim(),
        last_name: document.getElementById('last-name').value.trim()
      })
    });

    const result = await response.json();

    if (result.success) {
      document.getElementById('form-active').classList.add('hidden');
      document.getElementById('success-panel').classList.add('active');
    } else {
      showStatus(result.error || 'Payment failed. Please try again or contact support.', 'error');
      resetButton();
    }
  } catch (err) {
    showStatus('Something went wrong. Please try again.', 'error');
    resetButton();
  }
});

Spreedly.on('errors', function (errors) {
  const messages = errors.map(e => e.message).join(' ');
  showStatus(messages || 'Please check your card details.', 'error');
  resetButton();
});

// ═══════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════
function showStatus(msg, type) {
  statusMsg.textContent = msg;
  statusMsg.className = 'status-msg ' + type;
}

function hideStatus() {
  statusMsg.className = 'status-msg';
}

function resetButton() {
  submitBtn.disabled = !consentCheck.checked;
  submitBtn.textContent = 'Enroll — $99.00 / year';
}
