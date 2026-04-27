/**
 * auth.js — Authentication & User Navigation
 *
 * Handles: login, signup, logout, password strength,
 * user chip display, dropdown menu, social demo buttons.
 * Uses localStorage for demo persistence (no backend).
 */

// ── Tab switching ───────────────────────────────────────
export function switchTab(tab) {
  const isLogin = tab === 'login';
  document.getElementById('tabL').classList.toggle('on',  isLogin);
  document.getElementById('tabS').classList.toggle('on', !isLogin);
  document.getElementById('loginForm').style.display  =  isLogin ? 'block' : 'none';
  document.getElementById('signupForm').style.display = !isLogin ? 'block' : 'none';
  clearMsg();
}

// ── Message display ─────────────────────────────────────
export function showMsg(type, text) {
  const el = document.getElementById('authMsg');
  el.textContent = (type === 'ok' ? '✓ ' : '⚠ ') + text;
  el.className = 'auth-msg ' + type;
}

export function clearMsg() {
  const el = document.getElementById('authMsg');
  el.className = 'auth-msg';
  el.textContent = '';
}

// ── Login ───────────────────────────────────────────────
export function doLogin(onSuccess) {
  const email = document.getElementById('lEmail').value.trim();
  const pw    = document.getElementById('lPw').value;
  if (!email || !pw) { showMsg('err', 'Please fill in all fields.'); return; }

  const stored = JSON.parse(localStorage.getItem('ap_user') || 'null');
  if (!stored)                              showMsg('err', 'No account found. Sign up first.');
  else if (stored.email !== email || stored.pw !== btoa(pw)) showMsg('err', 'Wrong email or password.');
  else loginOk(stored, onSuccess);
}

// ── Signup ──────────────────────────────────────────────
export function doSignup(onSuccess) {
  const first = document.getElementById('sFirst').value.trim();
  const last  = document.getElementById('sLast').value.trim();
  const email = document.getElementById('sEmail').value.trim();
  const pw    = document.getElementById('sPw').value;
  const terms = document.getElementById('termsChk').checked;

  if (!first || !last)      { showMsg('err', 'Enter your full name.'); return; }
  if (!email.includes('@')) { showMsg('err', 'Enter a valid email.'); return; }
  if (pw.length < 8)        { showMsg('err', 'Password must be 8+ characters.'); return; }
  if (!terms)               { showMsg('err', 'Please agree to the Terms.'); return; }

  const user = {
    first, last, email,
    pw: btoa(pw),
    initials: (first[0] + last[0]).toUpperCase()
  };
  localStorage.setItem('ap_user', JSON.stringify(user));
  loginOk(user, onSuccess);
}

function loginOk(user, onSuccess) {
  showMsg('ok', `Welcome${user.first ? ', ' + user.first : ''}!`);
  setTimeout(() => {
    setNav(user);
    if (onSuccess) onSuccess();
  }, 850);
}

// ── Nav user chip ───────────────────────────────────────
export function setNav(user) {
  document.getElementById('guestBtns').style.display = 'none';
  document.getElementById('userChip').classList.add('show');
  document.getElementById('chipAv').textContent = user.initials || '?';
  document.getElementById('chipNm').textContent = user.first || 'Me';
  document.getElementById('dName').textContent  = (user.first + ' ' + user.last).trim();
  document.getElementById('dEmail').textContent = user.email;
}

export function doLogout(closeDrop) {
  closeDrop();
  document.getElementById('guestBtns').style.display = 'flex';
  document.getElementById('userChip').classList.remove('show');
}

// ── Dropdown ────────────────────────────────────────────
export function toggleDrop() {
  document.getElementById('uDrop').classList.toggle('open');
}

export function closeDrop() {
  document.getElementById('uDrop').classList.remove('open');
}

// ── Password strength meter ─────────────────────────────
export function pwStr(value) {
  let score = 0;
  if (value.length >= 8)           score++;
  if (/[A-Z]/.test(value))         score++;
  if (/[0-9]/.test(value))         score++;
  if (/[^A-Za-z0-9]/.test(value))  score++;

  const fill = document.getElementById('pwFill');
  fill.style.width      = ['0%','25%','50%','75%','100%'][score];
  fill.style.background = ['','#e74c3c','#e67e22','#f1c40f','#27ae60'][score];
}

// ── Social demo placeholder ─────────────────────────────
export function socDemo(provider) {
  showMsg('ok', `${provider} coming soon — use email!`);
}

// ── Restore session on load ─────────────────────────────
export function restoreSession() {
  const user = JSON.parse(localStorage.getItem('ap_user') || 'null');
  if (user?.email) setNav(user);
}
