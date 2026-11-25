const form = document.getElementById('loginForm');
const err = document.getElementById('loginError');
const btn = document.getElementById('loginBtn');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  err.textContent = '';
  btn.disabled = true;
  btn.textContent = 'Logging in...';
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: document.getElementById('username').value,
        password: document.getElementById('password').value,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Login failed');
    location.href = '/dashboard';
  } catch (ex) {
    err.textContent = ex.message;
    btn.disabled = false;
    btn.textContent = 'Login';
  }
});