const form = document.getElementById('verifyForm');
const input = document.getElementById('certId');
const out = document.getElementById('result');
const btn = document.getElementById('verifyBtn');

const fmt = (d) =>
  new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

function showError(title, message) {
  out.className = 'result bad';
  out.textContent = '';
  const h = document.createElement('h3');
  h.textContent = '❌ ' + title;
  const p = document.createElement('p');
  p.textContent = message;
  out.append(h, p);
}

function showCertificate(c) {
  if (c.status === 'revoked') {
    return showError(
      'Certificate Revoked',
      `Certificate ${c.certificateId} has been revoked by the issuing institution and is no longer valid.`
    );
  }
  const rows = [
    ['Student Name', c.studentName],
    ['Certificate ID', c.certificateId],
    ['Course Name', c.courseName],
    ['Institution Name', c.institutionName],
    ['Issue Date', fmt(c.issueDate)],
    ['Certificate Status', 'VALID'],
  ];
  out.className = 'result ok';
  out.textContent = '';
  const h = document.createElement('h3');
  h.textContent = '✅ Certificate Verified: Valid';
  const grid = document.createElement('div');
  grid.className = 'details';
  rows.forEach(([label, value]) => {
    const box = document.createElement('div');
    const s = document.createElement('span');
    s.textContent = label;
    const b = document.createElement('strong');
    b.textContent = value; // textContent prevents XSS
    box.append(s, b);
    grid.append(box);
  });
  out.append(h, grid);
}

async function verify(id) {
  btn.disabled = true;
  btn.textContent = 'Checking...';
  try {
    const res = await fetch('/api/verify/' + encodeURIComponent(id));
    if (res.status === 404) {
      showError('Invalid Certificate', 'No certificate was found with this ID. Please check the ID and try again.');
    } else if (res.status === 429) {
      showError('Too Many Requests', 'Please wait a minute and try again.');
    } else if (!res.ok) {
      showError('Error', 'Something went wrong. Please try again later.');
    } else {
      const data = await res.json();
      showCertificate(data.certificate);
    }
  } catch {
    showError('Network Error', 'Could not reach the server.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Verify';
  }
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const id = input.value.trim();
  if (id) verify(id);
});

// QR scan lands here as /verify.html?id=CERT-XXXX, so verify automatically
const preset = new URLSearchParams(location.search).get('id');
if (preset) {
  input.value = preset;
  verify(preset);
}
// ---------- QR scanning ----------
const qrFile = document.getElementById('qrFile');
const camBtn = document.getElementById('camBtn');
const camVideo = document.getElementById('camVideo');
const canvas = document.getElementById('scanCanvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
let stream = null;
let scanning = false;

// The QR holds a link like http://.../verify.html?id=CERT-2026-XXXXXX
function idFromQR(text) {
  try {
    const id = new URL(text).searchParams.get('id');
    if (id) return id;
  } catch {}
  return /^[A-Za-z0-9-]{4,40}$/.test(text.trim()) ? text.trim() : null;
}

function handleQR(text) {
  const id = idFromQR(text);
  if (!id) return showError('Invalid QR Code', 'This is not a certificate QR code.');
  input.value = id;
  verify(id);
}

// Upload an image of a QR code
qrFile.addEventListener('change', () => {
  const file = qrFile.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1000 / Math.max(img.width, img.height));
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const d = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(d.data, d.width, d.height);
      if (code) handleQR(code.data);
      else showError('QR Not Readable', 'No QR code was found in this image. Try a clearer image.');
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
  qrFile.value = '';
});

// Scan with the laptop webcam
async function startCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  } catch {
    return showError('Camera Error', 'Could not access the camera. Allow camera permission and try again.');
  }
  camVideo.srcObject = stream;
  camVideo.hidden = false;
  await camVideo.play();
  camBtn.textContent = '⏹ Stop Camera';
  scanning = true;
  requestAnimationFrame(tick);
}

function stopCamera() {
  scanning = false;
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null;
  camVideo.hidden = true;
  camBtn.textContent = '📷 Scan with Camera';
}

function tick() {
  if (!scanning) return;
  if (camVideo.readyState === camVideo.HAVE_ENOUGH_DATA) {
    canvas.width = camVideo.videoWidth;
    canvas.height = camVideo.videoHeight;
    ctx.drawImage(camVideo, 0, 0);
    const d = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(d.data, d.width, d.height);
    if (code) {
      stopCamera();
      handleQR(code.data);
      return;
    }
  }
  requestAnimationFrame(tick);
}

camBtn.addEventListener('click', () => (scanning ? stopCamera() : startCamera()));