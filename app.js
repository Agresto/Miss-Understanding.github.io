/**
 * Miss Understanding — Kalendarz Korepetycji v6
 *
 * KLUCZOWA ZMIANA v6:
 * - app.js jest teraz type="module"
 * - Firebase jest inicjalizowany BEZPOŚREDNIO tutaj — zero pośredników
 * - Gwarantuje synchronizację między WSZYSTKIMI urządzeniami
 *
 * LOGIN:  admin
 * HASŁO:  Kaczuszka123
 */

// ══════════════════════════════════════════════════════
// FIREBASE IMPORT — bezpośrednio, bez window.* pomostów
// ══════════════════════════════════════════════════════
import { initializeApp }              from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getDatabase, ref, set, get,
         remove, onValue }            from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';

// ══════════════════════════════════════════════════════
// KONFIGURACJA FIREBASE
// ▶ Uzupełnij własnymi danymi z https://console.firebase.google.com
// ▶ Instrukcja: README.md → sekcja "Konfiguracja Firebase"
// ══════════════════════════════════════════════════════
const FIREBASE_CONFIG = {
  apiKey:            'TWOJ_API_KEY',
  authDomain:        'TWOJ_PROJECT.firebaseapp.com',
  databaseURL:       'https://TWOJ_PROJECT-default-rtdb.europe-west1.firebasedatabase.app',
  projectId:         'TWOJ_PROJECT',
  storageBucket:     'TWOJ_PROJECT.appspot.com',
  messagingSenderId: 'TWOJ_SENDER_ID',
  appId:             'TWOJ_APP_ID',
};

// Wykryj czy config jest jeszcze placeholderem
const FIREBASE_CONFIGURED = !FIREBASE_CONFIG.apiKey.startsWith('TWOJ_');

let firebaseDB = null;

if (FIREBASE_CONFIGURED) {
  try {
    const app = initializeApp(FIREBASE_CONFIG);
    firebaseDB = getDatabase(app);
    console.log('✅ Firebase połączony — synchronizacja aktywna');
  } catch (e) {
    console.error('❌ Błąd Firebase:', e);
  }
} else {
  console.warn('⚠ Firebase nie skonfigurowany — tryb localStorage (dane tylko lokalne)');
}

// ══════════════════════════════════════════════════════
// KONFIGURACJA APLIKACJI
// ══════════════════════════════════════════════════════
const CONFIG = {
  ADMIN_LOGIN_HASH: '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918',
  ADMIN_PASS_HASH:  '461503f3bd6d0f3c66bf59009f40fbeca92a534cfcb8dddd4726404cc8fcb0fa',

  TEACHER_EMAIL:           'angielski.nataliawojcik@gmail.com',
  EMAILJS_SERVICE_ID:      'service_hjm3kfw',
  EMAILJS_TEMPLATE_ID:     'template_jqfskge',
  EMAILJS_NOTIFY_TEMPLATE: 'template_notify',
  EMAILJS_PUBLIC_KEY:      'wdy7EeWYr8gw3uqWa',

  SESSION_KEY:  'kalAdminSess',
  BRUTE_KEY:    'kalBrute',
  RATE_KEY:     'kalRate',
  LOCAL_BLOCKS:   'kalBlocks_v6',
  LOCAL_BOOKINGS: 'kalBookings_v6',
  LOCAL_SUBS:     'kalSubs_v6',

  MAX_LOGIN_ATTEMPTS:   5,
  LOCKOUT_MINUTES:      15,
  SESSION_TIMEOUT_MS:   30 * 60 * 1000,
  MAX_BOOKINGS_PER_DAY: 3,
  STEP_MINUTES:         30,
};

// ══════════════════════════════════════════════════════
// SHA-256
// ══════════════════════════════════════════════════════
async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ══════════════════════════════════════════════════════
// DATABASE — Firebase jeśli skonfigurowany, localStorage fallback
// ══════════════════════════════════════════════════════
const DB = {
  get ready() { return !!firebaseDB; },

  // ─── BLOKI ───
  async getBlocks() {
    if (!this.ready) return localGet(CONFIG.LOCAL_BLOCKS, []);
    const snap = await get(ref(firebaseDB, 'blocks'));
    if (!snap.exists()) return [];
    return Object.entries(snap.val()).map(([id, v]) => ({ ...v, id }));
  },

  async addBlock(block) {
    if (!this.ready) {
      const list = localGet(CONFIG.LOCAL_BLOCKS, []);
      list.push(block);
      localSet(CONFIG.LOCAL_BLOCKS, list);
      return;
    }
    await set(ref(firebaseDB, `blocks/${block.id}`), block);
  },

  async deleteBlock(id) {
    if (!this.ready) {
      localSet(CONFIG.LOCAL_BLOCKS, localGet(CONFIG.LOCAL_BLOCKS, []).filter(b => b.id !== id));
      return;
    }
    await remove(ref(firebaseDB, `blocks/${id}`));
  },

  // ─── REZERWACJE ───
  async getBookings() {
    if (!this.ready) return localGet(CONFIG.LOCAL_BOOKINGS, []);
    const snap = await get(ref(firebaseDB, 'bookings'));
    if (!snap.exists()) return [];
    return Object.entries(snap.val()).map(([id, v]) => ({ ...v, id }));
  },

  async addBooking(booking) {
    if (!this.ready) {
      const list = localGet(CONFIG.LOCAL_BOOKINGS, []);
      list.push(booking);
      localSet(CONFIG.LOCAL_BOOKINGS, list);
      return;
    }
    await set(ref(firebaseDB, `bookings/${booking.id}`), booking);
  },

  // ─── SUBSKRYBENCI ───
  async getSubscribers() {
    if (!this.ready) return localGet(CONFIG.LOCAL_SUBS, []);
    const snap = await get(ref(firebaseDB, 'subscribers'));
    if (!snap.exists()) return [];
    return Object.entries(snap.val()).map(([id, v]) => ({ ...v, id }));
  },

  async addSubscriber(email) {
    const existing = await this.getSubscribers();
    if (existing.find(s => s.email === email)) return 'exists';
    const id  = genId();
    const sub = { id, email, createdAt: new Date().toISOString() };
    if (!this.ready) {
      const list = localGet(CONFIG.LOCAL_SUBS, []);
      list.push(sub);
      localSet(CONFIG.LOCAL_SUBS, list);
      return 'added';
    }
    await set(ref(firebaseDB, `subscribers/${id}`), sub);
    return 'added';
  },

  async deleteSubscriber(id) {
    if (!this.ready) {
      localSet(CONFIG.LOCAL_SUBS, localGet(CONFIG.LOCAL_SUBS, []).filter(s => s.id !== id));
      return;
    }
    await remove(ref(firebaseDB, `subscribers/${id}`));
  },

  // ─── REAL-TIME LISTENER ───
  // Uruchamia callback() przy każdej zmianie w Firebase (działa dla WSZYSTKICH
  // zalogowanych użytkowników jednocześnie — tak właśnie działa synchronizacja)
  onDataChange(callback) {
    if (!this.ready) return () => {};
    const unsub1 = onValue(ref(firebaseDB, 'blocks'),   () => callback());
    const unsub2 = onValue(ref(firebaseDB, 'bookings'), () => callback());
    return () => { unsub1(); unsub2(); };
  },
};

// ══════════════════════════════════════════════════════
// LOCAL STORAGE HELPERS
// ══════════════════════════════════════════════════════
function localGet(key, def) {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(def)); }
  catch { return def; }
}
function localSet(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

// ══════════════════════════════════════════════════════
// RATE LIMITING
// ══════════════════════════════════════════════════════
const RateLimit = {
  _get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } },
  isLocked() {
    const d = this._get(CONFIG.BRUTE_KEY) || { count: 0, until: 0 };
    return d.count >= CONFIG.MAX_LOGIN_ATTEMPTS && Date.now() < d.until;
  },
  getRemainingMin() {
    return Math.ceil(((this._get(CONFIG.BRUTE_KEY) || { until: 0 }).until - Date.now()) / 60000);
  },
  recordFail() {
    const d = this._get(CONFIG.BRUTE_KEY) || { count: 0, until: 0 };
    d.count = (d.count || 0) + 1;
    if (d.count >= CONFIG.MAX_LOGIN_ATTEMPTS) d.until = Date.now() + CONFIG.LOCKOUT_MINUTES * 60000;
    localStorage.setItem(CONFIG.BRUTE_KEY, JSON.stringify(d));
  },
  reset() { localStorage.removeItem(CONFIG.BRUTE_KEY); },
  canBook() {
    const d = this._get(CONFIG.RATE_KEY) || { count: 0, date: '' };
    return d.date !== toDateStr(new Date()) || d.count < CONFIG.MAX_BOOKINGS_PER_DAY;
  },
  recordBooking() {
    const today = toDateStr(new Date());
    const d = this._get(CONFIG.RATE_KEY) || { count: 0, date: '' };
    localStorage.setItem(CONFIG.RATE_KEY, JSON.stringify(
      d.date !== today ? { count: 1, date: today } : { count: d.count + 1, date: today }
    ));
  },
};

// ══════════════════════════════════════════════════════
// SESSION
// ══════════════════════════════════════════════════════
const Session = {
  set(v) {
    if (v) {
      sessionStorage.setItem(CONFIG.SESSION_KEY, '1');
      sessionStorage.setItem('kalSessTs', Date.now().toString());
    } else {
      sessionStorage.removeItem(CONFIG.SESSION_KEY);
      sessionStorage.removeItem('kalSessTs');
    }
  },
  isAdmin() {
    if (sessionStorage.getItem(CONFIG.SESSION_KEY) !== '1') return false;
    const ts = parseInt(sessionStorage.getItem('kalSessTs') || '0');
    if (Date.now() - ts > CONFIG.SESSION_TIMEOUT_MS) { this.set(false); return false; }
    return true;
  },
  refresh() { if (this.isAdmin()) sessionStorage.setItem('kalSessTs', Date.now().toString()); },
};

['click', 'keydown', 'touchstart'].forEach(e =>
  document.addEventListener(e, () => Session.refresh(), { passive: true })
);

let sessionWatcher = null;
function startSessionWatcher() {
  clearInterval(sessionWatcher);
  sessionWatcher = setInterval(() => {
    if (!Session.isAdmin()) {
      clearInterval(sessionWatcher);
      hideAdminUI();
      showToast('Sesja wygasła — wylogowano automatycznie', 'info');
    }
  }, 30000);
}

// ══════════════════════════════════════════════════════
// SANITIZACJA
// ══════════════════════════════════════════════════════
function sanitize(s, max = 300) {
  return typeof s !== 'string' ? ''
    : s.trim().slice(0, max).replace(/[<>]/g, c => c === '<' ? '&lt;' : '&gt;');
}
function escHtml(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function isValidEmail(e) {
  return e.length <= 254 && /^[a-zA-Z0-9._%+\-]{1,64}@[a-zA-Z0-9.\-]{1,253}\.[a-zA-Z]{2,}$/.test(e);
}
function isValidName(n) { return n.length >= 2 && n.length <= 100; }

// ══════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════
function genId() {
  const a = new Uint8Array(10); crypto.getRandomValues(a);
  return Array.from(a).map(b => b.toString(16).padStart(2, '0')).join('');
}
const PL_MONTHS     = ['Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec','Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień'];
const PL_MONTHS_GEN = ['stycznia','lutego','marca','kwietnia','maja','czerwca','lipca','sierpnia','września','października','listopada','grudnia'];
const PL_DAYS       = ['Niedziela','Poniedziałek','Wtorek','Środa','Czwartek','Piątek','Sobota'];

function formatDate(ds) {
  const [y, m, d] = ds.split('-').map(Number);
  return `${PL_DAYS[new Date(y, m - 1, d).getDay()]}, ${d} ${PL_MONTHS_GEN[m - 1]} ${y}`;
}
function formatDateShort(ds) {
  const [y, m, d] = ds.split('-').map(Number);
  return `${d} ${PL_MONTHS[m - 1].slice(0, 3)} ${y}`;
}
function toDateStr(dt) {
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
function timeToMin(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
function minToTime(n) {
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
}
function formatDateTime(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  return `${d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}`;
}

// ══════════════════════════════════════════════════════
// GLOBALNY STAN
// ══════════════════════════════════════════════════════
let currentYear   = new Date().getFullYear();
let currentMonth  = new Date().getMonth();
let allBlocks     = [];
let allBookings   = [];
let pendingBlock  = null;
let pendingSlotId = null;

// ══════════════════════════════════════════════════════
// SYNC BAR (tylko dla admina)
// ══════════════════════════════════════════════════════
function setSyncStatus(status, text) {
  const bar = document.getElementById('syncBar');
  const dot = document.getElementById('syncDot');
  const txt = document.getElementById('syncText');
  if (!bar || !dot || !txt) return;
  bar.style.display = Session.isAdmin() ? 'flex' : 'none';
  dot.className = `sync-dot sync-${status}`;
  txt.textContent = text;
  bar.className = `sync-bar sync-bar-${status}`;
}

// ══════════════════════════════════════════════════════
// ŁADOWANIE DANYCH
// ══════════════════════════════════════════════════════
async function loadData() {
  setSyncStatus('loading', 'Łączenie z bazą danych…');
  try {
    [allBlocks, allBookings] = await Promise.all([DB.getBlocks(), DB.getBookings()]);
    const statusText = DB.ready
      ? '✓ Synchronizacja aktywna — dane widoczne na wszystkich urządzeniach'
      : '⚠ Tryb lokalny — dane widoczne tylko na tym urządzeniu (skonfiguruj Firebase)';
    setSyncStatus(DB.ready ? 'ok' : 'local', statusText);
    renderCalendar(currentYear, currentMonth);
    if (Session.isAdmin()) { renderAdminSlots(); updateAdminStats(); }
  } catch (e) {
    setSyncStatus('error', '✗ Błąd ładowania danych');
    console.error(e);
  }
}

// ══════════════════════════════════════════════════════
// WOLNE SEGMENTY BLOKU
// Odejmuje zarezerwowane przedziały, zwraca wolne kawałki
// Przykład: blok 16–20, rezerwacja 18–19 → [{16,18},{19,20}]
// ══════════════════════════════════════════════════════
function getFreeSegments(blockFrom, blockTo, bookedForBlock) {
  const start = timeToMin(blockFrom);
  const end   = timeToMin(blockTo);

  const taken = bookedForBlock
    .map(b => ({ from: timeToMin(b.bookedTimeFrom), to: timeToMin(b.bookedTimeTo) }))
    .sort((a, b) => a.from - b.from);

  const segs  = [];
  let cursor  = start;

  for (const t of taken) {
    if (t.from > cursor) segs.push({ from: minToTime(cursor), to: minToTime(t.from) });
    cursor = Math.max(cursor, t.to);
  }
  if (cursor < end) segs.push({ from: minToTime(cursor), to: minToTime(end) });

  return segs.filter(s => timeToMin(s.to) - timeToMin(s.from) >= CONFIG.STEP_MINUTES);
}

// ══════════════════════════════════════════════════════
// RENDEROWANIE KALENDARZA
// ══════════════════════════════════════════════════════
function renderCalendar(year, month) {
  const grid    = document.getElementById('calendarGrid');
  const monthEl = document.getElementById('calendarMonth');
  const isAdmin = Session.isAdmin();

  monthEl.textContent = `${PL_MONTHS[month]} ${year}`;

  const monthKey    = `${year}-${String(month + 1).padStart(2, '0')}`;
  const monthBlocks = allBlocks.filter(b => b.date.startsWith(monthKey));

  const blocksByDate = {};
  monthBlocks.forEach(b => { (blocksByDate[b.date] = blocksByDate[b.date] || []).push(b); });

  const firstDay    = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = (firstDay.getDay() + 6) % 7;
  const today       = new Date(); today.setHours(0,0,0,0);
  const todayStr    = toDateStr(today);

  let html = '';
  for (let i = 0; i < startOffset; i++) html += `<div class="day-cell empty" aria-hidden="true"></div>`;

  for (let day = 1; day <= daysInMonth; day++) {
    const ds       = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayDate  = new Date(ds + 'T00:00:00');
    const isPast   = dayDate < today;
    const isToday  = ds === todayStr;
    const isWknd   = dayDate.getDay() === 0 || dayDate.getDay() === 6;
    const blocks   = blocksByDate[ds] || [];

    // Wolne segmenty każdego bloku tego dnia
    const freeSegs = isPast ? [] : blocks.flatMap(b => {
      const bks = allBookings.filter(bk => bk.blockId === b.id);
      return getFreeSegments(b.timeFrom, b.timeTo, bks).map(s => ({ ...s, blockId: b.id }));
    });

    const hasFree   = freeSegs.length > 0;
    const hasBlocks = blocks.length > 0;
    const hasBooked = allBookings.some(bk => bk.date === ds);

    let cls = 'day-cell';
    if (isPast)   cls += ' is-past';
    if (isToday)  cls += ' today';
    if (isWknd)   cls += ' is-weekend';
    if (hasFree)  cls += ' has-slots';
    if (hasBlocks && !hasFree && !isPast) cls += ' has-booked-slots';

    let slotsHtml = '';

    if (isAdmin) {
      // Admin: wolne segmenty + zarezerwowane
      blocks.forEach(b => {
        const bks  = allBookings.filter(bk => bk.blockId === b.id);
        const segs = isPast ? [] : getFreeSegments(b.timeFrom, b.timeTo, bks);

        segs.forEach(seg => {
          slotsHtml += `<div class="slot-badge available" role="button" tabindex="0"
            onclick="handleAdminBlockClick('${b.id}','${ds}')">
            <span class="slot-dot"></span>${seg.from}–${seg.to}
          </div>`;
        });
        bks.forEach(bk => {
          slotsHtml += `<div class="slot-badge booked admin-booked-badge" role="button" tabindex="0"
            onclick="handleAdminBlockClick('${b.id}','${ds}')">
            <span class="slot-dot"></span>${bk.bookedTimeFrom}–${bk.bookedTimeTo} ✓
          </div>`;
        });
      });
    } else {
      // Użytkownik: wolne segmenty do kliknięcia + zarezerwowane wyszarzone
      freeSegs.forEach(seg => {
        slotsHtml += `<div class="slot-badge available" role="button" tabindex="0"
          data-block-id="${seg.blockId}"
          onclick="handleSegmentClick('${seg.blockId}','${ds}','${seg.from}','${seg.to}')">
          <span class="slot-dot"></span>${seg.from}–${seg.to}
        </div>`;
      });
      allBookings.filter(bk => bk.date === ds).forEach(bk => {
        slotsHtml += `<div class="slot-badge booked" aria-label="Zajęte">
          <span class="slot-dot"></span>${bk.bookedTimeFrom}–${bk.bookedTimeTo}
        </div>`;
      });
    }

    html += `
      <div class="${cls}" role="gridcell" aria-label="${day} ${PL_MONTHS[month]}">
        <div class="day-number">${day}</div>
        <div class="day-slots">${slotsHtml}</div>
        ${hasFree ? '<div class="day-mobile-dot day-mobile-dot-free" aria-hidden="true"></div>'
          : (hasBlocks && !isPast ? '<div class="day-mobile-dot day-mobile-dot-booked" aria-hidden="true"></div>' : '')}
      </div>`;
  }

  const rem = (startOffset + daysInMonth) % 7;
  if (rem) for (let i = 0; i < 7 - rem; i++) html += `<div class="day-cell empty" aria-hidden="true"></div>`;

  grid.innerHTML = html;

  // Keyboard nav
  grid.querySelectorAll('[data-block-id]').forEach(el =>
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); } })
  );

  // Animacja komórek
  requestAnimationFrame(() => {
    grid.querySelectorAll('.day-cell:not(.empty)').forEach((c, i) => {
      c.style.animationDelay = `${i * 7}ms`;
      c.classList.add('cell-appear');
    });
  });
}

// ══════════════════════════════════════════════════════
// KLIKNIĘCIE W SEGMENT (użytkownik)
// ══════════════════════════════════════════════════════
window.handleSegmentClick = function(blockId, dateStr, segFrom, segTo) {
  if (!RateLimit.canBook()) {
    showToast('Limit rezerwacji na dziś (3). Spróbuj jutro.', 'error');
    return;
  }
  const block = allBlocks.find(b => b.id === blockId);
  if (!block) return;

  const bks = allBookings.filter(bk => bk.blockId === blockId);
  pendingBlock = { blockId, date: dateStr, block, segFrom, segTo };

  buildScrollPickers(segFrom, segTo, bks);
  document.getElementById('timePickerDate').textContent = `📅 ${formatDate(dateStr)}`;
  document.getElementById('timePickerError').textContent = '';
  updateTimePreview();
  openModal('timePickerModal');
};

// ══════════════════════════════════════════════════════
// SCROLL PICKER
// ══════════════════════════════════════════════════════
function buildScrollPickers(segFrom, segTo, bks) {
  const fromEl   = document.getElementById('scrollFrom');
  const toEl     = document.getElementById('scrollTo');
  fromEl.innerHTML = ''; toEl.innerHTML = '';

  const segStart = timeToMin(segFrom);
  const segEnd   = timeToMin(segTo);
  const step     = CONFIG.STEP_MINUTES;
  const occupied = bks.map(s => ({ from: timeToMin(s.bookedTimeFrom), to: timeToMin(s.bookedTimeTo) }));

  const points = [];
  for (let t = segStart; t <= segEnd; t += step) points.push(t);

  points.forEach((mins, i) => {
    const tp = minToTime(mins);

    if (mins < segEnd) {
      const opt = mkOption(tp, i === 0);
      opt.addEventListener('click', () => selectOpt(fromEl, opt));
      fromEl.appendChild(opt);
    }
    if (mins > segStart) {
      const isOccupied = occupied.some(r => mins > r.from && mins < r.to);
      const opt = mkOption(tp, false, isOccupied);
      if (!isOccupied) opt.addEventListener('click', () => selectOpt(toEl, opt));
      toEl.appendChild(opt);
    }
  });

  const ff = fromEl.querySelector('.scroll-option');
  const ft = toEl.querySelector('.scroll-option');
  if (ff) selectOpt(fromEl, ff, false);
  if (ft) selectOpt(toEl, ft, false);
}

function mkOption(tp, selected = false, blocked = false) {
  const opt = document.createElement('div');
  opt.className = 'scroll-option' + (blocked ? ' scroll-option-blocked' : '');
  opt.textContent = tp;
  opt.dataset.value = tp;
  opt.setAttribute('role', 'option');
  opt.setAttribute('aria-selected', selected ? 'true' : 'false');
  if (selected) opt.classList.add('selected');
  if (blocked) opt.setAttribute('aria-disabled', 'true');
  return opt;
}

function selectOpt(container, opt, update = true) {
  container.querySelectorAll('.scroll-option').forEach(o => {
    o.classList.remove('selected'); o.setAttribute('aria-selected', 'false');
  });
  opt.classList.add('selected'); opt.setAttribute('aria-selected', 'true');
  opt.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  if (update) updateTimePreview();
}

function getSelectedTime(cid) {
  const sel = document.getElementById(cid)?.querySelector('.scroll-option.selected');
  return sel ? sel.dataset.value : null;
}

function updateTimePreview() {
  const from = getSelectedTime('scrollFrom');
  const to   = getSelectedTime('scrollTo');
  const prev = document.getElementById('timeSelectionPreview');
  const err  = document.getElementById('timePickerError');
  if (err) err.textContent = '';

  if (!from || !to) { prev.textContent = 'Wybierz godziny powyżej'; prev.className = 'time-selection-preview'; return; }

  const fMin = timeToMin(from), tMin = timeToMin(to);
  if (tMin <= fMin) { prev.textContent = '⚠ Godzina „Do" musi być późniejsza'; prev.className = 'time-selection-preview preview-invalid'; return; }

  if (pendingBlock) {
    const conflict = allBookings.some(bk =>
      bk.blockId === pendingBlock.blockId && from < bk.bookedTimeTo && to > bk.bookedTimeFrom
    );
    if (conflict) { prev.textContent = '⚠ Ten przedział jest już zajęty'; prev.className = 'time-selection-preview preview-invalid'; return; }
  }

  const dur = tMin - fMin;
  const h = Math.floor(dur / 60), m = dur % 60;
  const label = h > 0 && m > 0 ? `${h}h ${m}min` : h > 0 ? `${h}h` : `${m}min`;
  prev.innerHTML = `✓ Lekcja: <strong>${from}–${to}</strong> (${label})`;
  prev.className = 'time-selection-preview preview-valid';
}

document.getElementById('closeTimePickerModal')?.addEventListener('click', () => closeModal('timePickerModal'));

document.getElementById('confirmTimeBtn')?.addEventListener('click', () => {
  const from  = getSelectedTime('scrollFrom');
  const to    = getSelectedTime('scrollTo');
  const errEl = document.getElementById('timePickerError');
  errEl.textContent = '';

  if (!from || !to) { errEl.textContent = 'Wybierz godzinę startu i końca.'; return; }
  if (timeToMin(to) <= timeToMin(from)) { errEl.textContent = 'Godzina końca musi być po starcie.'; return; }
  if (!pendingBlock) { errEl.textContent = 'Błąd — spróbuj ponownie.'; return; }

  const conflict = allBookings.some(bk =>
    bk.blockId === pendingBlock.blockId && from < bk.bookedTimeTo && to > bk.bookedTimeFrom
  );
  if (conflict) { errEl.textContent = 'Ten czas jest już zajęty.'; return; }

  pendingBlock.chosenFrom = from;
  pendingBlock.chosenTo   = to;
  closeModal('timePickerModal');

  const dur = timeToMin(to) - timeToMin(from);
  const h = Math.floor(dur / 60), m = dur % 60;
  const label = h > 0 && m > 0 ? `${h}h ${m}min` : h > 0 ? `${h}h` : `${m}min`;

  document.getElementById('bookingSlotInfo').innerHTML =
    `📅 ${formatDate(pendingBlock.date)}<br>⏰ ${from}–${to} <span class="booking-dur">(${label})</span>`;
  ['bookName', 'bookEmail', 'bookMessage'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('bookingError').textContent = '';
  document.getElementById('bookingSubmitLabel').textContent = 'Zarezerwuj termin';
  const hp = document.getElementById('hpField'); if (hp) hp.value = '';
  openModal('bookingModal');
});

// ══════════════════════════════════════════════════════
// ADMIN — KLIKNIĘCIE W BLOK
// ══════════════════════════════════════════════════════
window.handleAdminBlockClick = function(blockId, dateStr) {
  if (!Session.isAdmin()) return;
  const block = allBlocks.find(b => b.id === blockId);
  if (!block) return;
  pendingSlotId = blockId;

  const bks  = allBookings.filter(bk => bk.blockId === blockId);
  const segs = getFreeSegments(block.timeFrom, block.timeTo, bks);

  document.getElementById('slotDetailContent').innerHTML = `
    <p><strong>Data:</strong> ${formatDate(dateStr)}</p>
    <p><strong>Blok:</strong> ${block.timeFrom}–${block.timeTo}</p>
    <p><strong>Wolne:</strong> ${segs.length ? segs.map(s => `${s.from}–${s.to}`).join(', ') : 'Brak'}</p>
    <p><strong>Rezerwacje (${bks.length}):</strong></p>
    ${bks.length ? bks.map(bk => `
      <div class="admin-sub-booking">
        <strong>${bk.bookedTimeFrom}–${bk.bookedTimeTo}</strong><br>
        👤 ${escHtml(bk.clientName)}<br>
        📧 ${escHtml(bk.clientEmail)}<br>
        ${bk.clientMessage ? `💬 ${escHtml(bk.clientMessage)}` : ''}
      </div>`).join('') : '<p style="color:var(--text-muted)">Brak rezerwacji.</p>'}`;
  document.getElementById('slotDetailTitle').textContent = 'Szczegóły bloku';
  openModal('slotDetailModal');
};

// ══════════════════════════════════════════════════════
// ADMIN — STATYSTYKI
// ══════════════════════════════════════════════════════
async function updateAdminStats() {
  if (!Session.isAdmin()) return;
  const freeCount = allBlocks.filter(b => {
    const bks = allBookings.filter(bk => bk.blockId === b.id);
    return getFreeSegments(b.timeFrom, b.timeTo, bks).length > 0;
  }).length;
  const subs = await DB.getSubscribers();
  const el = id => document.getElementById(id);
  if (el('statFree'))        el('statFree').textContent        = freeCount;
  if (el('statBooked'))      el('statBooked').textContent      = allBookings.length;
  if (el('statSubscribers')) el('statSubscribers').textContent = subs.length;
}

// ══════════════════════════════════════════════════════
// ADMIN — LISTA BLOKÓW
// ══════════════════════════════════════════════════════
function renderAdminSlots() {
  if (!Session.isAdmin()) return;
  const c      = document.getElementById('adminSlotsContent');
  const blocks = [...allBlocks].sort((a, b) =>
    a.date !== b.date ? a.date.localeCompare(b.date) : a.timeFrom.localeCompare(b.timeFrom)
  );

  if (!blocks.length) {
    c.innerHTML = `<div class="empty-state"><span class="empty-state-icon">📭</span>Brak terminów.</div>`;
    return;
  }

  c.innerHTML = blocks.map(b => {
    const bks     = allBookings.filter(bk => bk.blockId === b.id);
    const segs    = getFreeSegments(b.timeFrom, b.timeTo, bks);
    const hasFree = segs.length > 0;
    return `
      <div class="admin-slot-item">
        <div style="flex:1;min-width:0">
          <div class="admin-slot-date">${formatDate(b.date)}</div>
          <div class="admin-slot-time">⏰ ${b.timeFrom}–${b.timeTo}</div>
          ${hasFree ? `<div class="admin-free-segs">Wolne: ${segs.map(s => `<span>${s.from}–${s.to}</span>`).join('')}</div>` : ''}
          ${bks.map(bk => `
            <div class="admin-sub-item">
              ✓ ${bk.bookedTimeFrom}–${bk.bookedTimeTo} · 👤 ${escHtml(bk.clientName)}
              <span style="color:var(--text-muted);font-size:.76rem"> (${escHtml(bk.clientEmail)})</span>
            </div>`).join('')}
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end">
          <span class="admin-slot-status ${hasFree ? 'free' : 'reserved'}">
            ${hasFree ? `${segs.length} wolnych` : 'Pełny'}
          </span>
          <button class="btn-delete-mini" onclick="confirmDeleteSlot('${b.id}')">Usuń</button>
        </div>
      </div>`;
  }).join('');
}

// ══════════════════════════════════════════════════════
// ADMIN — LISTA SUBSKRYBENTÓW
// ══════════════════════════════════════════════════════
window.renderAdminSubscribers = async function() {
  if (!Session.isAdmin()) return;
  const container = document.getElementById('adminSubscribersList');
  const countEl   = document.getElementById('subscribersCount');
  if (!container) return;

  container.innerHTML = `<div class="subs-loading">Ładowanie…</div>`;

  const subs = await DB.getSubscribers();
  subs.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  if (countEl) countEl.textContent = subs.length;

  if (!subs.length) {
    container.innerHTML = `<div class="empty-state"><span class="empty-state-icon">📭</span>Brak subskrybentów.</div>`;
    return;
  }

  container.innerHTML = subs.map(s => `
    <div class="subscriber-item" id="sub-row-${s.id}">
      <button class="btn-delete-sub" onclick="deleteSubscriberById('${escHtml(s.id)}')"
              aria-label="Usuń ${escHtml(s.email)}">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path d="M2 3h10M5 3V2h4v1M6 6v4M8 6v4M3 3l1 9h6l1-9"
                stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
        </svg>
      </button>
      <div class="subscriber-email">${escHtml(s.email)}</div>
      <div class="subscriber-date">
        <span>${formatDateTime(s.createdAt).split(' ')[0]}</span>
        <span class="subscriber-time">${formatDateTime(s.createdAt).split(' ')[1] || ''}</span>
      </div>
    </div>`).join('');
};

window.deleteSubscriberById = async function(id) {
  if (!Session.isAdmin()) return;
  if (!confirm('Usunąć ten adres z listy powiadomień?')) return;
  try {
    await DB.deleteSubscriber(id);
    const row = document.getElementById(`sub-row-${id}`);
    if (row) {
      row.style.transition = 'opacity .3s, transform .3s';
      row.style.opacity = '0'; row.style.transform = 'translateX(-20px)';
      setTimeout(() => row.remove(), 320);
    }
    showToast('Subskrybent usunięty ✓', 'info');
    await updateAdminStats();
    const countEl = document.getElementById('subscribersCount');
    if (countEl) countEl.textContent = Math.max(0, parseInt(countEl.textContent) - 1);
  } catch {
    showToast('Błąd usuwania. Spróbuj ponownie.', 'error');
  }
};

// ══════════════════════════════════════════════════════
// ADMIN — DODAWANIE BLOKU
// ══════════════════════════════════════════════════════
document.getElementById('addSlotBtn')?.addEventListener('click', handleAddSlot);

async function handleAddSlot() {
  if (!Session.isAdmin()) return;
  const fb   = document.getElementById('adminFeedback');
  const date = sanitize(document.getElementById('adminDate').value);
  const from = sanitize(document.getElementById('adminTimeFrom').value);
  const to   = sanitize(document.getElementById('adminTimeTo').value);
  fb.className = 'admin-feedback'; fb.textContent = '';

  if (!date || !from || !to) { fb.textContent = 'Wypełnij wszystkie pola.'; fb.className = 'admin-feedback error'; return; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(from) || !/^\d{2}:\d{2}$/.test(to))
    { fb.textContent = 'Nieprawidłowy format.'; fb.className = 'admin-feedback error'; return; }
  if (from >= to) { fb.textContent = 'Koniec musi być po starcie.'; fb.className = 'admin-feedback error'; return; }
  if (timeToMin(to) - timeToMin(from) < CONFIG.STEP_MINUTES)
    { fb.textContent = `Blok musi trwać min. ${CONFIG.STEP_MINUTES} min.`; fb.className = 'admin-feedback error'; return; }
  if (allBlocks.some(b => b.date === date && from < b.timeTo && to > b.timeFrom))
    { fb.textContent = 'Nakłada się z istniejącym blokiem.'; fb.className = 'admin-feedback error'; return; }

  const btn = document.getElementById('addSlotBtn');
  btn.disabled = true;

  const block = { id: genId(), date, timeFrom: from, timeTo: to, createdAt: new Date().toISOString() };
  await DB.addBlock(block);

  // Fallback — ręczne odświeżenie (tylko gdy Firebase nie gotowy, bo listener nie istnieje)
  if (!DB.ready) {
    allBlocks.push(block);
    renderCalendar(currentYear, currentMonth);
    renderAdminSlots();
    updateAdminStats();
  }
  // Z Firebase: listener onDataChange() wywoła powyższe automatycznie i dokładnie raz

  fb.textContent = `✓ Dodano: ${formatDateShort(date)}, ${from}–${to}`;
  fb.className = 'admin-feedback success';
  document.getElementById('adminDate').value     = '';
  document.getElementById('adminTimeFrom').value = '';
  document.getElementById('adminTimeTo').value   = '';
  showToast('Blok dodany ✓', 'success');
  setTimeout(() => { fb.textContent = ''; }, 4000);
  btn.disabled = false;

  sendNewsletterNotifications(block);
}

async function sendNewsletterNotifications(block) {
  const subs = await DB.getSubscribers();
  if (!subs.length) return;
  for (const sub of subs) {
    try {
      await emailjs.send(CONFIG.EMAILJS_SERVICE_ID, CONFIG.EMAILJS_NOTIFY_TEMPLATE, {
        to_email: sub.email,
        date_formatted: formatDate(block.date),
        time_from: block.timeFrom,
        time_to:   block.timeTo,
        booking_url: window.location.href,
      });
    } catch (e) { console.warn('Błąd powiadomienia →', sub.email, e); }
  }
  showToast(`Powiadomienia wysłane (${subs.length}) ✓`, 'success');
}

// ══════════════════════════════════════════════════════
// ADMIN — USUWANIE BLOKU
// ══════════════════════════════════════════════════════
window.confirmDeleteSlot = function(id) {
  if (!Session.isAdmin()) return;
  pendingSlotId = id;
  const b = allBlocks.find(x => x.id === id); if (!b) return;
  document.getElementById('slotDetailContent').innerHTML = `
    <p><strong>Data:</strong> ${formatDate(b.date)}</p>
    <p><strong>Blok:</strong> ${b.timeFrom}–${b.timeTo}</p>
    <p style="color:var(--text-secondary);margin-top:12px">Usunięcie skasuje też wszystkie rezerwacje w tym bloku.</p>`;
  document.getElementById('slotDetailTitle').textContent = 'Usuń blok';
  openModal('slotDetailModal');
};

document.getElementById('deleteSlotBtn')?.addEventListener('click', async () => {
  if (!Session.isAdmin() || !pendingSlotId) return;
  const deletedId = pendingSlotId;
  await DB.deleteBlock(deletedId);

  if (!DB.ready) {
    allBlocks   = allBlocks.filter(b => b.id !== deletedId);
    allBookings = allBookings.filter(bk => bk.blockId !== deletedId);
    renderCalendar(currentYear, currentMonth);
    renderAdminSlots();
    updateAdminStats();
  }

  closeModal('slotDetailModal');
  showToast('Blok usunięty', 'info');
  pendingSlotId = null;
});

document.getElementById('closeSlotDetail')?.addEventListener('click', () => closeModal('slotDetailModal'));

// ══════════════════════════════════════════════════════
// REZERWACJA
// ══════════════════════════════════════════════════════
document.getElementById('closeBookingModal')?.addEventListener('click', () => closeModal('bookingModal'));
document.getElementById('bookingSubmit')?.addEventListener('click', handleBooking);

async function handleBooking() {
  const errEl = document.getElementById('bookingError');
  const btn   = document.getElementById('bookingSubmit');
  const lbl   = document.getElementById('bookingSubmitLabel');
  errEl.textContent = '';

  const hp = document.getElementById('hpField');
  if (hp && hp.value !== '') { await new Promise(r => setTimeout(r, 1200)); closeModal('bookingModal'); return; }

  if (!RateLimit.canBook()) { errEl.textContent = 'Limit rezerwacji na dziś (maks. 3).'; return; }

  const name    = sanitize(document.getElementById('bookName').value, 100);
  const email   = sanitize(document.getElementById('bookEmail').value, 254).toLowerCase();
  const message = sanitize(document.getElementById('bookMessage').value, 500);

  if (!isValidName(name))   { errEl.textContent = 'Podaj prawidłowe imię (min. 2 znaki).'; document.getElementById('bookName').focus(); return; }
  if (!isValidEmail(email)) { errEl.textContent = 'Podaj prawidłowy adres e-mail.'; document.getElementById('bookEmail').focus(); return; }
  if (!pendingBlock?.chosenFrom) { errEl.textContent = 'Błąd wyboru godzin — spróbuj ponownie.'; return; }

  const conflict = allBookings.some(bk =>
    bk.blockId === pendingBlock.blockId &&
    pendingBlock.chosenFrom < bk.bookedTimeTo &&
    pendingBlock.chosenTo   > bk.bookedTimeFrom
  );
  if (conflict) { errEl.textContent = 'Ktoś właśnie zarezerwował ten czas. Wybierz inne.'; return; }

  btn.disabled = true; lbl.textContent = 'Wysyłanie…';

  try {
    await sendBookingEmail({ clientName: name, clientEmail: email, clientMessage: message,
      date: pendingBlock.date, timeFrom: pendingBlock.chosenFrom, timeTo: pendingBlock.chosenTo });

    const booking = {
      id: genId(), blockId: pendingBlock.blockId, date: pendingBlock.date,
      bookedTimeFrom: pendingBlock.chosenFrom, bookedTimeTo: pendingBlock.chosenTo,
      clientName: name, clientEmail: email, clientMessage: message,
      bookedAt: new Date().toISOString(),
    };

    await DB.addBooking(booking);

    if (!DB.ready) {
      allBookings.push(booking);
      renderCalendar(currentYear, currentMonth);
      if (Session.isAdmin()) { renderAdminSlots(); updateAdminStats(); }
    }

    RateLimit.recordBooking();
    closeModal('bookingModal');
    document.getElementById('successMessage').innerHTML =
      `Potwierdzenie wysłano na <strong>${escHtml(email)}</strong>.<br>
       Do zobaczenia <strong>${formatDateShort(pendingBlock.date)}</strong> o <strong>${pendingBlock.chosenFrom}</strong>! 🎉`;
    openModal('successModal');
    pendingBlock = null;
  } catch (e) {
    console.error(e);
    errEl.textContent = 'Błąd wysyłki e-maila. Spróbuj ponownie lub napisz bezpośrednio.';
  } finally {
    btn.disabled = false; lbl.textContent = 'Zarezerwuj termin';
  }
}

document.getElementById('closeSuccessModal')?.addEventListener('click', () => closeModal('successModal'));

async function sendBookingEmail({ clientName, clientEmail, clientMessage, date, timeFrom, timeTo }) {
  const p = {
    to_name: clientName, to_email: clientEmail, teacher_email: CONFIG.TEACHER_EMAIL,
    date_formatted: formatDate(date), time_from: timeFrom, time_to: timeTo,
    message: clientMessage || 'Brak wiadomości', reply_to: clientEmail,
  };
  if (typeof emailjs !== 'undefined') {
    await emailjs.send(CONFIG.EMAILJS_SERVICE_ID, CONFIG.EMAILJS_TEMPLATE_ID, p);
  } else {
    console.log('📧 Demo mode:', p);
    await new Promise(r => setTimeout(r, 600));
  }
}

// ══════════════════════════════════════════════════════
// NEWSLETTER
// ══════════════════════════════════════════════════════
document.getElementById('newsletterSubmit')?.addEventListener('click', handleNewsletterSignup);
document.getElementById('newsletterEmail')?.addEventListener('keydown', e => { if (e.key === 'Enter') handleNewsletterSignup(); });

async function handleNewsletterSignup() {
  const emailEl = document.getElementById('newsletterEmail');
  const msgEl   = document.getElementById('newsletterMsg');
  const btn     = document.getElementById('newsletterSubmit');
  const lbl     = document.getElementById('newsletterBtnLabel');
  msgEl.textContent = ''; msgEl.className = 'newsletter-msg';

  const hp = document.getElementById('hpNewsletter');
  if (hp && hp.value !== '') { await new Promise(r => setTimeout(r, 1000)); return; }

  const email = sanitize(emailEl.value, 254).toLowerCase();
  if (!isValidEmail(email)) { msgEl.textContent = 'Podaj prawidłowy adres e-mail.'; msgEl.className = 'newsletter-msg error'; return; }

  btn.disabled = true; lbl.textContent = 'Zapisuję…';
  try {
    const result = await DB.addSubscriber(email);
    emailEl.value = '';
    if (result === 'exists') {
      msgEl.textContent = 'Ten adres jest już zapisany na liście powiadomień.';
      msgEl.className = 'newsletter-msg';
    } else {
      msgEl.textContent = '✓ Zapisano! Będziesz powiadamiany/a o nowych terminach.';
      msgEl.className = 'newsletter-msg success';
      showToast('Zapisano na powiadomienia ✓', 'success');
      updateAdminStats();
    }
  } catch {
    msgEl.textContent = 'Błąd zapisu. Spróbuj ponownie.';
    msgEl.className = 'newsletter-msg error';
  } finally {
    btn.disabled = false; lbl.textContent = 'Powiadom mnie';
  }
}

// ══════════════════════════════════════════════════════
// NAWIGACJA KALENDARZA
// ══════════════════════════════════════════════════════
document.getElementById('prevMonth')?.addEventListener('click', () => {
  currentMonth--; if (currentMonth < 0) { currentMonth = 11; currentYear--; }
  renderCalendar(currentYear, currentMonth);
});
document.getElementById('nextMonth')?.addEventListener('click', () => {
  currentMonth++; if (currentMonth > 11) { currentMonth = 0; currentYear++; }
  renderCalendar(currentYear, currentMonth);
});

// ══════════════════════════════════════════════════════
// LOGOWANIE
// ══════════════════════════════════════════════════════
document.getElementById('loginToggleBtn')?.addEventListener('click', () => {
  if (Session.isAdmin()) document.getElementById('adminPanel').scrollIntoView({ behavior: 'smooth' });
  else openModal('loginModal');
});
document.getElementById('closeLoginModal')?.addEventListener('click', () => closeModal('loginModal'));
document.getElementById('loginSubmit')?.addEventListener('click', handleLogin);
document.getElementById('loginPass')?.addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin(); });
document.getElementById('loginUser')?.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('loginPass').focus(); });
document.getElementById('togglePass')?.addEventListener('click', () => {
  const p = document.getElementById('loginPass'); p.type = p.type === 'password' ? 'text' : 'password';
});

async function handleLogin() {
  const errEl = document.getElementById('loginError'); errEl.textContent = '';
  if (RateLimit.isLocked()) { errEl.textContent = `Zablokowane. Spróbuj za ${RateLimit.getRemainingMin()} min.`; return; }
  const user = document.getElementById('loginUser').value.trim();
  const pass = document.getElementById('loginPass').value;
  if (!user || !pass) { errEl.textContent = 'Wypełnij oba pola.'; return; }
  const hp = document.getElementById('hpLogin');
  if (hp && hp.value !== '') { await new Promise(r => setTimeout(r, 1400)); errEl.textContent = 'Błędne dane.'; return; }
  const [uh, ph] = await Promise.all([sha256(user), sha256(pass)]);
  if (uh === CONFIG.ADMIN_LOGIN_HASH && ph === CONFIG.ADMIN_PASS_HASH) {
    RateLimit.reset(); Session.set(true);
    closeModal('loginModal');
    document.getElementById('loginUser').value = '';
    document.getElementById('loginPass').value = '';
    showAdminUI(); startSessionWatcher(); showToast('Zalogowano ✓', 'success');
  } else {
    RateLimit.recordFail();
    const d = RateLimit._get(CONFIG.BRUTE_KEY) || { count: 0 };
    const left = CONFIG.MAX_LOGIN_ATTEMPTS - d.count;
    errEl.textContent = left > 0 ? `Błędne dane. Pozostało prób: ${Math.max(0, left)}` : `Zablokowane na ${CONFIG.LOCKOUT_MINUTES} min.`;
    document.getElementById('loginPass').value = '';
    document.getElementById('loginPass').focus();
    const card = document.querySelector('.login-modal-card');
    if (card) { card.style.animation = 'none'; card.offsetHeight; card.style.animation = 'shake 0.4s ease'; }
  }
}

function showAdminUI() {
  const p = document.getElementById('adminPanel');
  if (p) { p.style.display = 'block'; p.setAttribute('aria-hidden', 'false'); }
  document.getElementById('loginBtnLabel').textContent = 'Panel';
  setSyncStatus(DB.ready ? 'ok' : 'local',
    DB.ready ? '✓ Synchronizacja aktywna' : '⚠ Tryb lokalny — skonfiguruj Firebase dla synchronizacji');
  renderAdminSlots();
  renderAdminSubscribers();
  updateAdminStats();
  renderWeekGrid(); // odśwież grafik w trybie admin
}

function hideAdminUI() {
  const p = document.getElementById('adminPanel');
  if (p) { p.style.display = 'none'; p.setAttribute('aria-hidden', 'true'); }
  document.getElementById('loginBtnLabel').textContent = 'Panel Nauczycielski';
  const bar = document.getElementById('syncBar');
  if (bar) bar.style.display = 'none';
  renderWeekGrid(); // odśwież grafik w trybie ucznia (bez admin-booked badge)
}

document.getElementById('logoutBtn')?.addEventListener('click', () => {
  Session.set(false); clearInterval(sessionWatcher);
  hideAdminUI(); renderCalendar(currentYear, currentMonth);
  showToast('Wylogowano', 'info'); closeHamburger();
});

// ══════════════════════════════════════════════════════
// MODALS
// ══════════════════════════════════════════════════════
function openModal(id) {
  const el = document.getElementById(id); if (!el) return;
  el.setAttribute('aria-hidden', 'false'); el.classList.add('active');
  document.body.style.overflow = 'hidden';
  setTimeout(() => {
    const f = el.querySelector('input:not([tabindex="-1"]),textarea,.btn-submit,.modal-close');
    if (f) f.focus();
  }, 120);
}
function closeModal(id) {
  const el = document.getElementById(id); if (!el) return;
  el.setAttribute('aria-hidden', 'true'); el.classList.remove('active');
  document.body.style.overflow = '';
}
document.querySelectorAll('.modal-overlay').forEach(o =>
  o.addEventListener('click', e => { if (e.target === o) closeModal(o.id); })
);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.querySelectorAll('.modal-overlay.active').forEach(m => closeModal(m.id));
});

// ══════════════════════════════════════════════════════
// HAMBURGER + THEME
// ══════════════════════════════════════════════════════
const hamburger = document.getElementById('hamburger');
const navMenu   = document.getElementById('nav-menu');

hamburger?.addEventListener('click', () => {
  const e = hamburger.getAttribute('aria-expanded') === 'true';
  hamburger.setAttribute('aria-expanded', String(!e));
  navMenu.classList.toggle('open', !e);
  document.body.classList.toggle('nav-open', !e);
});

function closeHamburger() {
  hamburger?.setAttribute('aria-expanded', 'false');
  navMenu?.classList.remove('open');
  document.body.classList.remove('nav-open');
}

navMenu?.querySelectorAll('[data-close-nav]').forEach(el =>
  el.addEventListener('click', () => setTimeout(closeHamburger, 100))
);
document.addEventListener('click', e => {
  if (navMenu?.classList.contains('open') && !navMenu.contains(e.target) && e.target !== hamburger) closeHamburger();
});

const themeToggle = document.getElementById('themeToggle');
const themeIcon   = document.getElementById('themeIcon');
const themeLabel  = document.getElementById('themeLabel');
const htmlEl      = document.documentElement;

function setTheme(t) {
  htmlEl.setAttribute('data-theme', t);
  if (themeIcon)  themeIcon.textContent  = t === 'dark' ? '☀' : '☽';
  if (themeLabel) themeLabel.textContent = t === 'dark' ? 'Jasność' : 'Ciemność';
  localStorage.setItem('kalTheme', t);
}
themeToggle?.addEventListener('click', () => setTheme(htmlEl.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'));
setTheme(localStorage.getItem('kalTheme') || 'dark');

// ══════════════════════════════════════════════════════
// SMOOTH SCROLL
// ══════════════════════════════════════════════════════
document.querySelectorAll('a[href^="#"]').forEach(l => l.addEventListener('click', e => {
  const t = document.querySelector(l.getAttribute('href'));
  if (t) { e.preventDefault(); t.scrollIntoView({ behavior: 'smooth' }); }
}));

// ══════════════════════════════════════════════════════
// TOAST
// ══════════════════════════════════════════════════════
let tc;
function showToast(msg, type = 'info', dur = 3500) {
  if (!tc) { tc = document.createElement('div'); tc.className = 'toast-container'; tc.setAttribute('aria-live', 'polite'); document.body.appendChild(tc); }
  const t = document.createElement('div'); t.className = `toast ${type}`; t.textContent = sanitize(msg, 150); t.setAttribute('role', 'status');
  tc.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 350); }, dur);
}

// ══════════════════════════════════════════════════════
// ANIMACJE
// ══════════════════════════════════════════════════════
function initParticles() {
  const c = document.getElementById('heroParticles'); if (!c) return;
  const n = window.innerWidth < 640 ? 10 : 22;
  for (let i = 0; i < n; i++) {
    const p = document.createElement('div'); p.className = 'particle';
    p.style.cssText = `left:${Math.random()*100}%;top:${Math.random()*100}%;width:${2+Math.random()*3}px;height:${2+Math.random()*3}px;animation-delay:${Math.random()*6}s;animation-duration:${4+Math.random()*6}s;opacity:${.1+Math.random()*.35};`;
    c.appendChild(p);
  }
}

function initScrollReveal() {
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('revealed'); obs.unobserve(e.target); } });
  }, { threshold: 0.12 });
  document.querySelectorAll('.section-header,.calendar-grid-wrapper,.newsletter-card,.admin-form-card,.footer-brand,.footer-contact,.footer-info')
    .forEach(el => { el.classList.add('reveal-target'); obs.observe(el); });
}

// ══════════════════════════════════════════════════════
// CSS ANIMATIONS (inject once)
// ══════════════════════════════════════════════════════
const animStyle = document.createElement('style');
animStyle.textContent = `
@keyframes shake{0%,100%{transform:translateX(0) scale(1)}20%{transform:translateX(-8px) scale(.99)}40%{transform:translateX(8px) scale(.99)}60%{transform:translateX(-5px)}80%{transform:translateX(5px)}}
@keyframes cell-appear{from{opacity:0;transform:scale(.9)}to{opacity:1;transform:scale(1)}}
.cell-appear{animation:cell-appear .3s ease both;}
@keyframes reveal-up{from{opacity:0;transform:translateY(28px)}to{opacity:1;transform:translateY(0)}}
.reveal-target{opacity:0;transform:translateY(28px);}
.reveal-target.revealed{animation:reveal-up .65s cubic-bezier(.16,1,.3,1) both;}
@keyframes particle-float{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-20px) scale(1.1)}}
.particle{position:absolute;border-radius:50%;background:var(--color-accent);animation:particle-float linear infinite;pointer-events:none;}
`;
document.head.appendChild(animStyle);

// ══════════════════════════════════════════════════════
// DANE DEMO (tylko gdy localStorage fallback i brak danych)
// ══════════════════════════════════════════════════════
async function initDemoData() {
  if (DB.ready) return; // Firebase ma swoje dane
  const existing = await DB.getBlocks();
  if (existing.length > 0) return;
  const t = new Date();
  const add = async (d, f, to) => {
    const x = new Date(t); x.setDate(t.getDate() + d);
    await DB.addBlock({ id: genId(), date: toDateStr(x), timeFrom: f, timeTo: to, createdAt: new Date().toISOString() });
  };
  await add(2, '16:00', '20:00');
  await add(4, '10:00', '14:00');
  await add(7, '15:00', '18:30');
}

// ══════════════════════════════════════════════════════
// SKELETON
// ══════════════════════════════════════════════════════
function showSkeleton() {
  const g = document.getElementById('calendarGrid');
  let h = ''; for (let i = 0; i < 35; i++) h += `<div class="skeleton-cell"></div>`;
  g.innerHTML = `<div class="skeleton-grid" style="display:grid;grid-template-columns:repeat(7,1fr);grid-column:1/-1">${h}</div>`;
}

// ══════════════════════════════════════════════════════
// STARTUP
// ══════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('year').textContent = new Date().getFullYear();
  initParticles();
  initScrollReveal();
  showSkeleton();

  // Dane demo (tylko fallback)
  await initDemoData();

  // Ładuj dane z Firebase lub localStorage
  await loadData();

  // Real-time listener — KLUCZOWE dla synchronizacji między urządzeniami
  // Gdy ktokolwiek doda blok lub rezerwację, WSZYSCY użytkownicy zobaczą zmiany
  DB.onDataChange(async () => {
    [allBlocks, allBookings] = await Promise.all([DB.getBlocks(), DB.getBookings()]);
    renderCalendar(currentYear, currentMonth);
    if (Session.isAdmin()) { renderAdminSlots(); updateAdminStats(); }
  });

  // Sesja
  if (Session.isAdmin()) { showAdminUI(); startSessionWatcher(); }

  // Admin form defaults
  const di = document.getElementById('adminDate');
  if (di) { di.min = toDateStr(new Date()); di.value = toDateStr(new Date()); }
});

// ══════════════════════════════════════════════════════════════
// MODUŁ: GRAFIK TYGODNIOWY v2
// Poprawki: neon kolory, brak dat/poziomu/czasu trwania,
// reset po wylogowaniu, fix błędu rezerwacji, real-time sync
// ══════════════════════════════════════════════════════════════

const SCHED_PATHS = { slots: 'scheduleSlots', bookings: 'scheduleBookings' };

const SchedDB = {
  async getSlots() {
    if (!firebaseDB) return localGet('schedSlots_v2', []);
    const snap = await get(ref(firebaseDB, SCHED_PATHS.slots));
    if (!snap.exists()) return [];
    return Object.entries(snap.val()).map(([id, v]) => ({ ...v, id }));
  },
  async addSlot(slot) {
    if (!firebaseDB) { const l=localGet('schedSlots_v2',[]); l.push(slot); localSet('schedSlots_v2',l); return; }
    await set(ref(firebaseDB, `${SCHED_PATHS.slots}/${slot.id}`), slot);
  },
  async deleteSlot(id) {
    if (!firebaseDB) { localSet('schedSlots_v2', localGet('schedSlots_v2',[]).filter(s=>s.id!==id)); return; }
    await remove(ref(firebaseDB, `${SCHED_PATHS.slots}/${id}`));
  },
  async getBookings() {
    if (!firebaseDB) return localGet('schedBookings_v2', []);
    const snap = await get(ref(firebaseDB, SCHED_PATHS.bookings));
    if (!snap.exists()) return [];
    return Object.entries(snap.val()).map(([id, v]) => ({ ...v, id }));
  },
  async addBooking(booking) {
    if (!firebaseDB) { const l=localGet('schedBookings_v2',[]); l.push(booking); localSet('schedBookings_v2',l); return; }
    await set(ref(firebaseDB, `${SCHED_PATHS.bookings}/${booking.id}`), booking);
  },
  onDataChange(cb) {
    if (!firebaseDB) return ()=>{};
    const u1 = onValue(ref(firebaseDB, SCHED_PATHS.slots),    ()=>cb());
    const u2 = onValue(ref(firebaseDB, SCHED_PATHS.bookings), ()=>cb());
    return ()=>{ u1(); u2(); };
  },
};

let schedSlots       = [];
let schedBookings    = [];
let pendingSchedInfo = null; // { slotId, segFrom, segTo, durMin, dayName }

const DAY_NAMES = ['','Poniedziałek','Wtorek','Środa','Czwartek','Piątek'];

const STAGE_LABELS = {
  'SP-4':'Klasa 4 SP','SP-5':'Klasa 5 SP','SP-6':'Klasa 6 SP',
  'SP-7':'Klasa 7 SP','SP-8':'Klasa 8 SP (egzamin ósmoklasisty)',
  'LO-1':'Klasa 1 LO','LO-2':'Klasa 2 LO','LO-3':'Klasa 3 LO','LO-4':'Klasa 4 LO (matura)',
  'T-1':'Klasa 1 Technikum','T-2':'Klasa 2 Technikum','T-3':'Klasa 3 Technikum',
  'T-4':'Klasa 4 Technikum','T-5':'Klasa 5 Technikum (matura)',
  'student':'Student/ka','adult':'Dorosły — nie chodzę do szkoły',
};

async function loadScheduleData() {
  [schedSlots, schedBookings] = await Promise.all([SchedDB.getSlots(), SchedDB.getBookings()]);
  renderWeekGrid();
  if (Session.isAdmin()) renderAdminScheduleSlots();
}

// ── Wolne segmenty: oddzielnie 1h i 1.5h ──────────────────────
// Zwraca { seg1h: [{from,to}], seg15h: [{from,to}] }
function getSchedSegments(blockFrom, blockTo, booked) {
  const start  = timeToMin(blockFrom);
  const end    = timeToMin(blockTo);
  const taken  = booked.map(b => ({
    from: timeToMin(b.bookedTimeFrom), to: timeToMin(b.bookedTimeTo)
  }));

  const seg1h  = [];
  const seg15h = [];

  // Krok co 30 min, ale każdy slot trwa dokładnie 60 lub 90 min
  for (let t = start; t < end; t += 30) {
    for (const dur of [60, 90]) {
      const tEnd = t + dur;
      if (tEnd > end) continue;
      const overlap = taken.some(r => t < r.to && tEnd > r.from);
      if (!overlap) {
        const seg = { from: minToTime(t), to: minToTime(tEnd) };
        if (dur === 60) seg1h.push(seg);
        else             seg15h.push(seg);
      }
    }
  }

  // Deduplikacja (posortowane, unikalne klucze)
  const dedup = arr => {
    const seen = new Set();
    return arr.filter(s => { const k=`${s.from}-${s.to}`; if(seen.has(k)) return false; seen.add(k); return true; });
  };

  return { seg1h: dedup(seg1h), seg15h: dedup(seg15h) };
}

// ── RENDER WEEK GRID ──────────────────────────────────────────
function renderWeekGrid() {
  const isAdmin = Session.isAdmin();

  for (let d = 1; d <= 5; d++) {
    const container = document.getElementById(`daySlots${d}`);
    if (!container) continue;

    const daySlots = schedSlots
      .filter(s => s.dayOfWeek === d)
      .sort((a, b) => a.timeFrom.localeCompare(b.timeFrom));

    if (!daySlots.length) {
      container.innerHTML = `<div class="week-empty">Brak terminów</div>`;
      continue;
    }

    let html = '';

    daySlots.forEach(slot => {
      const booked = schedBookings.filter(b => b.slotId === slot.id);
      const { seg1h, seg15h } = getSchedSegments(slot.timeFrom, slot.timeTo, booked);

      if (isAdmin) {
        // Admin: zajęte (niebieskie) + wolne (kolorowe)
        booked.forEach(b => {
          html += `<button class="week-slot-badge booked-admin" onclick="showSchedBookingDetail('${b.id}')">
            <span class="slot-dot"></span>${b.bookedTimeFrom}–${b.bookedTimeTo} ✓ ${escHtml(b.clientName||'')}
          </button>`;
        });
        seg1h.forEach(seg => {
          html += `<button class="week-slot-badge seg-1h" onclick="showAdminSchedSlot('${slot.id}')">
            <span class="slot-dot"></span>${seg.from}–${seg.to} <em>1h</em>
          </button>`;
        });
        seg15h.forEach(seg => {
          html += `<button class="week-slot-badge seg-15h" onclick="showAdminSchedSlot('${slot.id}')">
            <span class="slot-dot"></span>${seg.from}–${seg.to} <em>1.5h</em>
          </button>`;
        });
      } else {
        // Użytkownik: zajęte (szare) + wolne (kolorowe)
        booked.forEach(b => {
          html += `<button class="week-slot-badge booked" disabled aria-label="Zajęte ${b.bookedTimeFrom}–${b.bookedTimeTo}">
            <span class="slot-dot"></span>${b.bookedTimeFrom}–${b.bookedTimeTo}
          </button>`;
        });
        seg1h.forEach(seg => {
          html += `<button class="week-slot-badge seg-1h"
            onclick="openSchedBooking('${slot.id}','${seg.from}','${seg.to}',60)"
            aria-label="Zarezerwuj ${DAY_NAMES[d]} ${seg.from}–${seg.to} (1h)">
            <span class="slot-dot"></span>${seg.from}–${seg.to}
          </button>`;
        });
        seg15h.forEach(seg => {
          html += `<button class="week-slot-badge seg-15h"
            onclick="openSchedBooking('${slot.id}','${seg.from}','${seg.to}',90)"
            aria-label="Zarezerwuj ${DAY_NAMES[d]} ${seg.from}–${seg.to} (1.5h)">
            <span class="slot-dot"></span>${seg.from}–${seg.to}
          </button>`;
        });
      }
    });

    container.innerHTML = html || `<div class="week-empty">Brak miejsc</div>`;
  }
}

// ── OTWIERANIE MODALU REZERWACJI ──────────────────────────────
window.openSchedBooking = function(slotId, segFrom, segTo, durMin) {
  // Admin nie może rezerwować jako uczeń — tylko niezalogowani
  if (Session.isAdmin()) {
    showToast('Wyloguj się, aby zarezerwować jako uczeń.', 'info');
    return;
  }
  if (!RateLimit.canBook()) {
    showToast('Limit rezerwacji na dziś. Spróbuj jutro.', 'error');
    return;
  }

  const slot = schedSlots.find(s => s.id === slotId);
  if (!slot) { showToast('Błąd: nie znaleziono terminu.', 'error'); return; }

  // Podwójne sprawdzenie konfliktu (live data)
  const taken = schedBookings.filter(b => b.slotId === slotId);
  const conflict = taken.some(b => segFrom < b.bookedTimeTo && segTo > b.bookedTimeFrom);
  if (conflict) { showToast('Ten termin właśnie ktoś zarezerwował. Odśwież stronę.', 'error'); renderWeekGrid(); return; }

  pendingSchedInfo = { slotId, segFrom, segTo, durMin, dayName: DAY_NAMES[slot.dayOfWeek] };

  const durLabel = durMin === 90 ? '1,5 godziny' : '1 godzina';
  document.getElementById('schedBookingSlotInfo').innerHTML =
    `📆 <strong>${DAY_NAMES[slot.dayOfWeek]}</strong> &nbsp;⏰ <strong>${segFrom}–${segTo}</strong><br>
     Czas lekcji: <strong>${durLabel}</strong> · stały, tygodniowy termin`;

  // Reset formularza
  ['schedName','schedEmail','schedPhone','schedMessage','schedExamOther'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  ['schedSchoolStage','schedExam'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  document.getElementById('schedBookingError').textContent = '';
  document.getElementById('schedBookingSubmitLabel').textContent = 'Zarezerwuj stały termin';
  const eg = document.getElementById('examOtherGroup'); if (eg) eg.style.display = 'none';
  const hp = document.getElementById('hpSched'); if (hp) hp.value = '';

  openModal('scheduleBookingModal');
};

window.toggleExamOther = function(sel) {
  const grp = document.getElementById('examOtherGroup');
  if (grp) grp.style.display = sel.value === 'inne' ? 'block' : 'none';
};

document.getElementById('closeScheduleBookingModal')?.addEventListener('click', () => closeModal('scheduleBookingModal'));
document.getElementById('closeSchedSuccessModal')?.addEventListener('click', () => closeModal('schedSuccessModal'));

// ── OBSŁUGA REZERWACJI ────────────────────────────────────────
document.getElementById('schedBookingSubmit')?.addEventListener('click', handleSchedBooking);

async function handleSchedBooking() {
  const errEl = document.getElementById('schedBookingError');
  const btn   = document.getElementById('schedBookingSubmit');
  const lbl   = document.getElementById('schedBookingSubmitLabel');
  errEl.textContent = '';

  const hp = document.getElementById('hpSched');
  if (hp && hp.value !== '') { await new Promise(r=>setTimeout(r,1000)); closeModal('scheduleBookingModal'); return; }

  if (!pendingSchedInfo) { errEl.textContent = 'Błąd — wybierz termin ponownie.'; return; }

  const { slotId, segFrom, segTo, durMin, dayName } = pendingSchedInfo;

  const name    = sanitize(document.getElementById('schedName').value, 100);
  const email   = sanitize(document.getElementById('schedEmail').value, 254).toLowerCase();
  const phone   = sanitize(document.getElementById('schedPhone').value, 30);
  const stage   = sanitize(document.getElementById('schedSchoolStage').value, 50);
  const examRaw = sanitize(document.getElementById('schedExam').value, 100);
  const examOth = sanitize(document.getElementById('schedExamOther').value, 300);
  const message = sanitize(document.getElementById('schedMessage').value, 500);
  const exam    = examRaw === 'inne' ? (examOth || 'Inne') : examRaw;

  if (!isValidName(name))   { errEl.textContent = 'Podaj imię i nazwisko (min. 2 znaki).'; document.getElementById('schedName').focus(); return; }
  if (!isValidEmail(email)) { errEl.textContent = 'Podaj prawidłowy adres e-mail.'; document.getElementById('schedEmail').focus(); return; }
  if (!phone.trim())        { errEl.textContent = 'Podaj numer telefonu.'; document.getElementById('schedPhone').focus(); return; }
  if (!stage)               { errEl.textContent = 'Wybierz etap edukacji.'; return; }
  if (!examRaw)             { errEl.textContent = 'Wybierz cel nauki.'; return; }

  // Ponowne sprawdzenie konfliktu (ktoś mógł zarezerwować między otwarciem modalu a kliknięciem)
  const latestBookings = await SchedDB.getBookings();
  const conflict = latestBookings.some(b =>
    b.slotId === slotId && segFrom < b.bookedTimeTo && segTo > b.bookedTimeFrom
  );
  if (conflict) {
    errEl.textContent = 'Ten termin właśnie został zarezerwowany przez kogoś innego. Wybierz inny.';
    schedBookings = latestBookings;
    renderWeekGrid();
    return;
  }

  btn.disabled = true; lbl.textContent = 'Wysyłanie…';

  try {
    await sendSchedBookingEmail({ clientName:name, clientEmail:email, clientPhone:phone,
      dayName, timeFrom:segFrom, timeTo:segTo, stage, exam, message, durMin });

    const booking = {
      id: genId(), slotId, dayOfWeek: schedSlots.find(s=>s.id===slotId)?.dayOfWeek,
      bookedTimeFrom: segFrom, bookedTimeTo: segTo,
      clientName:name, clientEmail:email, clientPhone:phone,
      stage, exam, message, durMin,
      bookedAt: new Date().toISOString(),
    };

    await SchedDB.addBooking(booking);
    // Lokalny fallback — firebase listener nie istnieje
    if (!firebaseDB) { schedBookings.push(booking); renderWeekGrid(); }

    RateLimit.recordBooking();
    closeModal('scheduleBookingModal');

    const durLabel = durMin === 90 ? '1,5 godziny' : '1 godzinę';
    document.getElementById('schedSuccessMessage').innerHTML =
      `Potwierdzenie wysłano na <strong>${escHtml(email)}</strong>.<br>
       Twój termin: <strong>${dayName}, ${segFrom}–${segTo}</strong> (${durLabel}) 🎉<br>
       <small>Nauczycielka skontaktuje się z Tobą w celu potwierdzenia szczegółów.</small>`;
    openModal('schedSuccessModal');
    pendingSchedInfo = null;
  } catch(e) {
    console.error(e);
    errEl.textContent = 'Błąd wysyłki. Spróbuj ponownie lub napisz bezpośrednio na e-mail.';
  } finally {
    btn.disabled = false; lbl.textContent = 'Zarezerwuj stały termin';
  }
}

// ── EMAIL — STAŁY TERMIN ──────────────────────────────────────
async function sendSchedBookingEmail({ clientName, clientEmail, clientPhone,
  dayName, timeFrom, timeTo, stage, exam, message, durMin }) {
  const durLabel = durMin === 90 ? '1,5 godziny (90 min)' : '1 godzina (60 min)';
  const p = {
    to_name:       clientName,
    to_email:      clientEmail,
    teacher_email: CONFIG.TEACHER_EMAIL,
    booking_type:  'Stały tygodniowy termin',
    day_name:      dayName,
    time_from:     timeFrom,
    time_to:       timeTo,
    duration:      durLabel,
    phone:         clientPhone,
    school_stage:  STAGE_LABELS[stage] || stage,
    exam_goal:     exam,
    message:       message || 'Brak',
    reply_to:      clientEmail,
  };
  if (typeof emailjs !== 'undefined') {
    await emailjs.send(CONFIG.EMAILJS_SERVICE_ID, 'template_schedule', p);
  } else {
    console.log('📧 Demo — stały termin:', p);
    await new Promise(r => setTimeout(r, 500));
  }
}

// ── ADMIN: DODAWANIE SLOTU ────────────────────────────────────
document.getElementById('addScheduleSlotBtn')?.addEventListener('click', handleAddScheduleSlot);

async function handleAddScheduleSlot() {
  if (!Session.isAdmin()) return;
  const fb   = document.getElementById('schedAdminFeedback');
  const day  = parseInt(document.getElementById('schedDayOfWeek').value);
  const from = sanitize(document.getElementById('schedTimeFrom').value);
  const to   = sanitize(document.getElementById('schedTimeTo').value);
  fb.className = 'admin-feedback'; fb.textContent = '';

  if (!from || !to) { fb.textContent='Podaj godziny.'; fb.className='admin-feedback error'; return; }
  if (from >= to)   { fb.textContent='Koniec musi być po starcie.'; fb.className='admin-feedback error'; return; }
  if (timeToMin(to)-timeToMin(from) < 60) { fb.textContent='Blok musi trwać min. 1 godzinę.'; fb.className='admin-feedback error'; return; }
  if (schedSlots.some(s => s.dayOfWeek===day && from<s.timeTo && to>s.timeFrom))
    { fb.textContent='Nakłada się z istniejącym blokiem.'; fb.className='admin-feedback error'; return; }

  const slot = { id:genId(), dayOfWeek:day, timeFrom:from, timeTo:to, createdAt:new Date().toISOString() };
  await SchedDB.addSlot(slot);
  if (!firebaseDB) { schedSlots.push(slot); renderWeekGrid(); renderAdminScheduleSlots(); }

  fb.textContent = `✓ Dodano: ${DAY_NAMES[day]}, ${from}–${to}`;
  fb.className = 'admin-feedback success';
  document.getElementById('schedTimeFrom').value = '';
  document.getElementById('schedTimeTo').value   = '';
  showToast('Termin dodany ✓', 'success');
  setTimeout(() => { fb.textContent = ''; }, 4000);
}

// ── ADMIN: LISTA SLOTÓW ───────────────────────────────────────
function renderAdminScheduleSlots() {
  if (!Session.isAdmin()) return;
  const c = document.getElementById('adminScheduleSlotsContent');
  if (!c) return;
  if (!schedSlots.length) { c.innerHTML=`<div class="empty-state"><span class="empty-state-icon">📭</span>Brak terminów w grafiku.</div>`; return; }

  const sorted = [...schedSlots].sort((a,b)=>a.dayOfWeek-b.dayOfWeek||a.timeFrom.localeCompare(b.timeFrom));
  c.innerHTML = sorted.map(slot => {
    const bks = schedBookings.filter(b=>b.slotId===slot.id);
    const { seg1h, seg15h } = getSchedSegments(slot.timeFrom, slot.timeTo, bks);
    const freeCount = seg1h.length + seg15h.length;
    return `
      <div class="admin-slot-item">
        <div style="flex:1;min-width:0">
          <div class="admin-slot-date">${DAY_NAMES[slot.dayOfWeek]}</div>
          <div class="admin-slot-time">⏰ ${slot.timeFrom}–${slot.timeTo}</div>
          ${seg1h.length ? `<div class="admin-free-segs">1h: ${seg1h.map(s=>`<span class="seg-badge-1h">${s.from}–${s.to}</span>`).join('')}</div>` : ''}
          ${seg15h.length ? `<div class="admin-free-segs">1.5h: ${seg15h.map(s=>`<span class="seg-badge-15h">${s.from}–${s.to}</span>`).join('')}</div>` : ''}
          ${bks.map(b=>`
            <div class="admin-sub-item">
              ✓ ${b.bookedTimeFrom}–${b.bookedTimeTo}
              · 👤 ${escHtml(b.clientName)}
              · 📞 ${escHtml(b.clientPhone||'')}
              <span style="color:var(--text-muted);font-size:.76rem">(${escHtml(b.clientEmail)})</span>
              · 🎓 ${escHtml(STAGE_LABELS[b.stage]||b.stage||'')}
              · 🎯 ${escHtml(b.exam||'')}
              ${b.message?`<br><small style="color:var(--text-muted)">💬 ${escHtml(b.message)}</small>`:''}
            </div>`).join('')}
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end">
          <span class="admin-slot-status ${freeCount?'free':'reserved'}">${freeCount?`${freeCount} wolnych`:'Pełny'}</span>
          <button class="btn-delete-mini" onclick="deleteScheduleSlot('${slot.id}')">Usuń</button>
        </div>
      </div>`;
  }).join('');
}

window.deleteScheduleSlot = async function(id) {
  if (!Session.isAdmin() || !confirm('Usunąć ten termin z grafiku? Skasuje też rezerwacje.')) return;
  await SchedDB.deleteSlot(id);
  if (!firebaseDB) { schedSlots=schedSlots.filter(s=>s.id!==id); schedBookings=schedBookings.filter(b=>b.slotId!==id); renderWeekGrid(); renderAdminScheduleSlots(); }
  showToast('Termin usunięty','info');
};

window.showSchedBookingDetail = function(bookingId) {
  const b = schedBookings.find(x=>x.id===bookingId);
  if (!b) return;
  const slot = schedSlots.find(s=>s.id===b.slotId);
  alert(
    `👤 ${b.clientName}\n📧 ${b.clientEmail}\n📞 ${b.clientPhone||'—'}\n`+
    `📆 ${slot?DAY_NAMES[slot.dayOfWeek]:''}, ${b.bookedTimeFrom}–${b.bookedTimeTo}\n`+
    `🎓 ${STAGE_LABELS[b.stage]||b.stage||'—'}\n🎯 ${b.exam||'—'}\n💬 ${b.message||'—'}`
  );
};

window.showAdminSchedSlot = function(slotId) {
  const slot = schedSlots.find(s=>s.id===slotId);
  if (!slot) return;
  const bks = schedBookings.filter(b=>b.slotId===slotId);
  const { seg1h, seg15h } = getSchedSegments(slot.timeFrom, slot.timeTo, bks);
  const info = bks.length ? bks.map(b=>`${b.bookedTimeFrom}–${b.bookedTimeTo}: ${b.clientName}`).join('\n') : 'Brak rezerwacji';
  const freeInfo = [...seg1h.map(s=>`${s.from}–${s.to} (1h)`),...seg15h.map(s=>`${s.from}–${s.to} (1.5h)`)].join(', ')||'Brak';
  alert(`${DAY_NAMES[slot.dayOfWeek]} ${slot.timeFrom}–${slot.timeTo}\n\nWolne: ${freeInfo}\n\nRezerwacje:\n${info}`);
};

window.switchAdminTab = function(tab) {
  document.getElementById('adminTabSlots').style.display    = tab==='slots'    ? 'block' : 'none';
  document.getElementById('adminTabSchedule').style.display = tab==='schedule' ? 'block' : 'none';
  document.querySelectorAll('.admin-tab').forEach(btn=>btn.classList.remove('active'));
  document.getElementById(tab==='slots'?'tabSlots':'tabSchedule').classList.add('active');
  if (tab==='schedule') renderAdminScheduleSlots();
};

// Real-time sync — każda zmiana widoczna u wszystkich natychmiast
SchedDB.onDataChange(async () => {
  [schedSlots, schedBookings] = await Promise.all([SchedDB.getSlots(), SchedDB.getBookings()]);
  renderWeekGrid();
  if (Session.isAdmin()) renderAdminScheduleSlots();
});

loadScheduleData();

// ─── Firebase paths dla grafiku ───
