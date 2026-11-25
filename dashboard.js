const $ = (s) => document.querySelector(s);
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (d) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

let page = 1, search = '', list = [], editingId = null;

function toast(msg, type = 'ok') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast show ' + type;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.className = 'toast'), 3000);
}

async function api(url, method = 'GET', body) {
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    location.href = '/login.html';
    throw new Error('Session expired');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Request failed');
  return data;
}

const rowHtml = (c) => `
  <tr>
    <td><code>${esc(c.certificateId)}</code></td>
    <td>${esc(c.studentName)}<small>${esc(c.rollNumber)}</small></td>
    <td>${esc(c.courseName)}<small>${esc(c.institutionName)}</small></td>
    <td>${fmt(c.issueDate)}</td>
    <td><span class="badge ${c.status}">${c.status}</span></td>
    <td class="actions">
      <button class="btn btn-light btn-sm" data-action="edit" data-id="${esc(c.certificateId)}">Edit</button>
      <button class="btn btn-light btn-sm" data-action="qr" data-id="${esc(c.certificateId)}">QR</button>
      ${
        c.status === 'valid'
          ? `<button class="btn btn-danger btn-sm" data-action="revoke" data-id="${esc(c.certificateId)}">Revoke</button>`
          : `<button class="btn btn-light btn-sm" data-action="restore" data-id="${esc(c.certificateId)}">Restore</button>`
      }
    </td>
  </tr>`;

async function load() {
  const q = new URLSearchParams({ page, search });
  const d = await api('/api/certificates?' + q);
  list = d.certificates;
  $('#statTotal').textContent = d.stats.total;
  $('#statValid').textContent = d.stats.valid;
  $('#statRevoked').textContent = d.stats.revoked;
  $('#rows').innerHTML = list.length
    ? list.map(rowHtml).join('')
    : '<tr><td colspan="6" class="empty">No certificates found.</td></tr>';
  $('#pageInfo').textContent = `Page ${d.page} of ${d.pages}`;
  $('#prev').disabled = d.page <= 1;
  $('#next').disabled = d.page >= d.pages;
}

/* ---------- Modals ---------- */
const closeModals = () => document.querySelectorAll('.modal').forEach((m) => (m.hidden = true));
document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeModals));
document.querySelectorAll('.modal').forEach((m) =>
  m.addEventListener('click', (e) => e.target === m && closeModals())
);
document.addEventListener('keydown', (e) => e.key === 'Escape' && closeModals());

function openForm(c) {
  editingId = c ? c.certificateId : null;
  $('#formTitle').textContent = c ? 'Edit Certificate ' + c.certificateId : 'Issue Certificate';
  $('#formError').textContent = '';
  $('#f_studentName').value = c ? c.studentName : '';
  $('#f_rollNumber').value = c ? c.rollNumber : '';
  $('#f_studentEmail').value = c ? c.studentEmail : '';
  $('#f_courseName').value = c ? c.courseName : '';
  $('#f_institutionName').value = c ? c.institutionName : '';
  $('#f_issueDate').value = c ? c.issueDate.slice(0, 10) : new Date().toISOString().slice(0, 10);
  $('#formModal').hidden = false;
  $('#f_studentName').focus();
}

async function showQR(id) {
  const d = await api(`/api/certificates/${encodeURIComponent(id)}/qr`);
  $('#qrCertId').textContent = id;
  $('#qrImg').src = d.qr;
  $('#qrUrl').textContent = d.url;
  const dl = $('#qrDownload');
  dl.href = d.qr;
  dl.download = `${id}-qr.png`;
  $('#qrModal').hidden = false;
}

/* ---------- Events ---------- */
$('#addBtn').addEventListener('click', () => openForm(null));

$('#certForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#formError').textContent = '';
  const body = {
    studentName: $('#f_studentName').value,
    rollNumber: $('#f_rollNumber').value,
    studentEmail: $('#f_studentEmail').value,
    courseName: $('#f_courseName').value,
    institutionName: $('#f_institutionName').value,
    issueDate: $('#f_issueDate').value,
  };
  try {
    if (editingId) {
      await api(`/api/certificates/${encodeURIComponent(editingId)}`, 'PUT', body);
      closeModals();
      toast('Certificate updated');
      await load();
    } else {
      const d = await api('/api/certificates', 'POST', body);
      closeModals();
      toast('Certificate issued: ' + d.certificate.certificateId);
      await load();
      await showQR(d.certificate.certificateId); // show QR right after issuing
    }
  } catch (err) {
    $('#formError').textContent = err.message;
  }
});

$('#rows').addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-action]');
  if (!b) return;
  const id = b.dataset.id;
  const c = list.find((x) => x.certificateId === id);
  try {
    switch (b.dataset.action) {
      case 'edit': openForm(c); break;
      case 'qr': await showQR(id); break;
      case 'revoke': {
        const reason = prompt('Reason for revoking (optional):');
        if (reason === null) return;
        await api(`/api/certificates/${encodeURIComponent(id)}/revoke`, 'PATCH', { reason });
        toast('Certificate revoked');
        await load();
        break;
      }
      case 'restore':
        if (!confirm('Restore this certificate to VALID?')) return;
        await api(`/api/certificates/${encodeURIComponent(id)}/reactivate`, 'PATCH');
        toast('Certificate restored');
        await load();
        break;
    }
  } catch (err) {
    toast(err.message, 'err');
  }
});

let debounce;
$('#searchInput').addEventListener('input', (e) => {
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    search = e.target.value.trim();
    page = 1;
    load().catch((err) => toast(err.message, 'err'));
  }, 300);
});

$('#prev').addEventListener('click', () => { page--; load(); });
$('#next').addEventListener('click', () => { page++; load(); });

$('#logoutBtn').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  location.href = '/login.html';
});

/* ---------- Init ---------- */
api('/api/auth/me').then((d) => ($('#adminName').textContent = d.username));
load().catch((err) => toast(err.message, 'err'));