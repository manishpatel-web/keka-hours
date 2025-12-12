// keka-hours-autoupdate-breaks-right-side.js
// FINAL: includes floating timer (draggable), minimize/tray, pre-alert (7h50m), sound alert, desktop + toast notifications
(function(){
  'use strict';

  /* -----------------------  Config & Persistence  ------------------------ */
  const WORK_MINUTES = 8 * 60;            // 480
  const PRE_ALERT_MINUTES = WORK_MINUTES - 10; // 470 (7h50m)
  const STORAGE_PREFIX = 'keka_hours_';   // keys: keka_hours_eight_done_date, keka_hours_pre_done_date, keka_hours_prefs

  // default preferences
  const defaultPrefs = {
    soundOnComplete: true,
    soundOnPreAlert: true,
    showFloatingTimer: true
  };

  function loadPrefs() {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + 'prefs');
      if (!raw) return Object.assign({}, defaultPrefs);
      return Object.assign({}, defaultPrefs, JSON.parse(raw));
    } catch (e) { return Object.assign({}, defaultPrefs); }
  }
  function savePrefs(p) {
    try { localStorage.setItem(STORAGE_PREFIX + 'prefs', JSON.stringify(p||{})); } catch(e){}
  }
  const prefs = loadPrefs();

  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function wasNotified(key) {
    try {
      return localStorage.getItem(STORAGE_PREFIX + key) === todayKey();
    } catch(e){ return false; }
  }
  function markNotified(key) {
    try { localStorage.setItem(STORAGE_PREFIX + key, todayKey()); } catch(e){}
  }

  /* -----------------------  Toast Utility  ------------------------ */
  const toast = (msg, ttl=1800) => {
    try {
      const n = document.createElement('div');
      n.textContent = msg;
      n.style.cssText = [
        'position:fixed',
        'top:14px',
        'right:14px',
        'z-index:2147483647',
        'background:rgba(15,23,42,0.95)',
        'color:#fff',
        'padding:8px 12px',
        'border-radius:8px',
        'font-size:13px',
        'font-family:Inter,Arial,sans-serif',
        'box-shadow:0 6px 18px rgba(0,0,0,0.25)'
      ].join(';');
      document.body.appendChild(n);
      setTimeout(()=>{ n.style.opacity='0'; setTimeout(()=>n.remove(),260); }, ttl);
    } catch(e){}
  };

  /* -----------------------  Notification Permission  ------------------------ */
  if (Notification && Notification.permission !== "granted") {
    try { Notification.requestPermission(); } catch(e) {}
  }

  /* -----------------------  Sound (WebAudio) ------------------------ */
  let audioCtx = null;
  function ensureAudioCtx() {
    try {
      if(!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      return audioCtx;
    } catch(e){ return null; }
  }
  function playTone(freq = 880, durationMs = 300, vol = 0.15) {
    const ctx = ensureAudioCtx();
    if(!ctx) return;
    try {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      g.gain.value = vol;
      o.connect(g);
      g.connect(ctx.destination);
      const now = ctx.currentTime;
      o.start(now);
      g.gain.setValueAtTime(vol, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + durationMs/1000);
      o.stop(now + durationMs/1000 + 0.02);
    } catch(e){}
  }
  function playCompleteSound() {
    if(!prefs.soundOnComplete) return;
    // pleasant two-tone chime
    playTone(880, 220, 0.12);
    setTimeout(()=>playTone(1320, 220, 0.12), 240);
  }
  function playPreAlertSound() {
    if(!prefs.soundOnPreAlert) return;
    // short warning beep
    playTone(660, 180, 0.12);
  }

  /* -----------------------  Notify Functions ------------------------ */
  function showDesktopNotification(title, body) {
    try {
      if (Notification && Notification.permission === "granted") {
        new Notification(title, { body });
      }
    } catch(e){}
  }

  function notifyPreAlert() {
    if (wasNotified('pre_done_date')) return;
    showDesktopNotification('⏰ 10 minutes to 8 hours', 'You will reach 8 hours in ~10 minutes.');
    toast('⏰ 10 minutes left for 8 hours');
    playPreAlertSound();
    markNotified('pre_done_date');
  }

  function notifyComplete() {
    if (wasNotified('eight_done_date')) return;
    showDesktopNotification('🎉 8 Hours Completed!', 'You have completed 8 working hours today.');
    toast('🎉 8 Hours Completed!');
    playCompleteSound();
    markNotified('eight_done_date');
  }

  /* -----------------------  Helpers (time parsing) ------------------------ */
  const trim = s => (s && s.trim) ? s.trim() : s;
  const selLogs = '.modal-body form div[formarrayname="logs"], .modal-body form div[formArrayName="logs"], .modal-body [formarrayname="logs"], .modal-body [formArrayName="logs"]';

  const parseTime = ts => {
    if(!ts || ts === 'MISSING') return null;
    const parts = String(ts).toLowerCase().split(' ').filter(Boolean);

    if(parts.length === 1 && parts[0].includes(':')) {
      const [h,m] = parts[0].split(':').map(Number);
      if(Number.isFinite(h) && Number.isFinite(m)) return { hours:h, minutes:m };
    }
    if(parts.length < 2) return null;
    const [hm, ap] = parts;
    const [Hstr, Mstr] = hm.split(':');
    let H = Number(Hstr||0), M = Number(Mstr||0);
    if(ap === 'pm' && H !== 12) H += 12;
    if(ap === 'am' && H === 12) H = 0;
    return { hours:H, minutes:M };
  };

  const minutesBetween = (s,e) => {
    const st = parseTime(s);
    const en = (e === 'MISSING') ? { hours:(new Date()).getHours(), minutes:(new Date()).getMinutes() } : parseTime(e);
    if(!st || !en) return 0;
    let mins = (en.hours - st.hours) * 60 + (en.minutes - st.minutes);
    if(mins < 0) mins += 24*60;
    if(mins > 12*60) mins = 0;
    return mins;
  };

  /* -----------------------  Main Log Processor  ------------------------ */
  function processLogs(container, renderRowBadges = true){
    if(!container) return null;
    const rows = Array.from(container.querySelectorAll('.ng-untouched.ng-pristine.ng-valid'));
    if(!rows.length) return null;

    let totalM = 0, firstStart = null, prevEnd = null, breakM = 0;
    const rowDetails = [];

    rows.forEach((row, idx) => {
      const startEl = row.querySelector('.d-flex.align-items-center .w-120.mr-20 .text-small')
                    || row.querySelector('.w-120.mr-20 .text-small')
                    || row.querySelector('.w-120.mr-20')
                    || row.querySelector('.text-small');

      const endEl = row.querySelector('.d-flex.align-items-center .w-120:not(.mr-20) .text-small')
                    || row.querySelector('.w-120:not(.mr-20) .text-small')
                    || row.querySelector('.w-120:not(.mr-20)');

      const s = startEl ? trim(startEl.textContent) : null;
      const e = endEl ? trim(endEl.textContent) : null;

      if(idx === 0) firstStart = s;

      let thisBreak = 0;
      if(idx !== 0 && prevEnd && s) {
        thisBreak = minutesBetween(prevEnd, s);
        breakM += thisBreak;
      }

      const d = minutesBetween(s, e);
      totalM += d;

      rowDetails.push({ index: idx, start: s, end: e, minutes: d, breakAfterPrev: thisBreak });

      // Chip UI
      if(renderRowBadges && idx !== 0) {
        try { row.style.position = row.style.position || 'relative'; } catch(e){}
        let chip = row.querySelector('.keka-break-chip-right');
        if(thisBreak > 0) {
          const h = Math.floor(thisBreak/60);
          const m = thisBreak % 60;
          const chipText = `Break: ${h}h ${m}m`;
          if(!chip){
            chip = document.createElement('div');
            chip.className = 'keka-break-chip-right';
            chip.style.cssText = [
              'position:absolute',
              'right:12px',
              'top:50%',
              'transform:translateY(-50%)',
              'background:#eef2ff',
              'color:#3730a3',
              'padding:6px 10px',
              'border-radius:14px',
              'font-size:12px',
              'box-shadow:0 4px 10px rgba(15,23,42,0.06)',
              'z-index:9999',
              'min-width:72px',
              'text-align:center',
              'pointer-events:auto'
            ].join(';');
            chip.textContent = chipText;
            row.appendChild(chip);
          } else chip.textContent = chipText;
        } else if(chip && chip.parentNode) chip.parentNode.removeChild(chip);
      }

      prevEnd = e;
    });

    const result = {
      totalMinutes: totalM,
      totalHuman: `${Math.floor(totalM/60)} Hr ${totalM%60} Min`,
      firstStart,
      breakMinutes: breakM,
      rows: rowDetails,
      overtimeMinutes: Math.max(0, totalM - WORK_MINUTES),
      remainingMinutes: Math.max(0, WORK_MINUTES - totalM)
    };

    // store latest for floating usage
    window.KekaHoursLatest = result;
    return result;
  }

  /* -----------------------  Card Renderer  ------------------------ */
  function renderCards(container){
    const r = processLogs(container, false);
    if(!r) return;
    const completionDate = (function(){
      if(!r.firstStart) return 'N/A';
      const st = parseTime(r.firstStart);
      if(!st) return 'N/A';
      const base = new Date(); base.setHours(st.hours, st.minutes, 0, 0);
      const comp = new Date(base.getTime() + (WORK_MINUTES + r.breakMinutes) * 60 * 1000);
      let s = comp.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', hour12:true });
      if(r.totalMinutes >= WORK_MINUTES) s += ' (Completed ✓)';
      return s;
    })();

    const overtimeStr = r.overtimeMinutes > 0 ? `${Math.floor(r.overtimeMinutes/60)} Hr ${r.overtimeMinutes%60} Min` : 'No overtime';
    const remainingStr = r.remainingMinutes <= 0 ? '8 hours completed! 🎉' : `${Math.floor(r.remainingMinutes/60)}h ${r.remainingMinutes%60}m`;
    const isCompleted = r.remainingMinutes <= 0;
    const overRemainBg = isCompleted ? 'linear-gradient(135deg,#10b981,#059669)' : 'linear-gradient(135deg,#ef4444,#dc2626)';

    let wrapper = container.querySelector('.keka-autoupdate-wrapper');
    if(!wrapper){
      wrapper = document.createElement('div');
      wrapper.className = 'keka-autoupdate-wrapper';
      wrapper.style.cssText = 'margin:18px 20px;padding:14px;background:#fff;border-radius:12px;border:1px solid #e6edf3;box-shadow:0 6px 20px rgba(15,23,42,0.03)';
      container.appendChild(wrapper);
    }

    wrapper.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;">
        <div style="background:linear-gradient(135deg,#a78bfa,#7c3aed);color:#fff;padding:12px;border-radius:10px">
          <div style="font-size:13px;opacity:.95">Total Duration</div>
          <div style="font-size:16px;font-weight:600;margin-top:6px">${r.totalHuman}</div>
        </div>

        <div style="background:linear-gradient(135deg,#60a5fa,#3b82f6);color:#fff;padding:12px;border-radius:10px">
          <div style="font-size:13px;opacity:.95">8hr Completion</div>
          <div style="font-size:16px;font-weight:600;margin-top:6px">${completionDate}</div>
        </div>

        <div style="background:linear-gradient(135deg,#fb923c,#ea580c);color:#fff;padding:12px;border-radius:10px">
          <div style="font-size:13px;opacity:.95">Total Breaks</div>
          <div style="font-size:16px;font-weight:600;margin-top:6px">${Math.floor(r.breakMinutes/60)}h ${r.breakMinutes%60}m</div>
        </div>

        <div style="background:${overRemainBg};color:#fff;padding:12px;border-radius:10px">
          <div style="font-size:13px;opacity:.95">Overtime / Remaining</div>
          <div style="font-size:16px;font-weight:600;margin-top:6px">${overtimeStr} / ${remainingStr}</div>
        </div>
      </div>
      <div style="margin-top:10px;font-size:12px;display:flex;gap:6px;align-items:center">
        <label style="display:flex;align-items:center;gap:6px"><input id="keka_pref_sound_complete" type="checkbox" /> Sound on complete</label>
        <label style="display:flex;align-items:center;gap:6px;margin-left:8px"><input id="keka_pref_sound_pre" type="checkbox" /> Pre-alert (10m) sound</label>
      </div>
    `;

    // wire preference checkboxes
    try {
      const cb1 = wrapper.querySelector('#keka_pref_sound_complete');
      const cb2 = wrapper.querySelector('#keka_pref_sound_pre');
      if(cb1) { cb1.checked = !!prefs.soundOnComplete; cb1.onchange = (e)=>{ prefs.soundOnComplete = !!e.target.checked; savePrefs(prefs); }; }
      if(cb2) { cb2.checked = !!prefs.soundOnPreAlert; cb2.onchange = (e)=>{ prefs.soundOnPreAlert = !!e.target.checked; savePrefs(prefs); }; }
    } catch(e){}
  }

  /* -----------------------  Floating Timer Widget ------------------------ */
  let floatingTickInterval = null;

  function createFloatingTimer() {
    if(!prefs.showFloatingTimer) return;
    if(document.getElementById('floatingTimerBox')) return;

    const timerBox = document.createElement("div");
    timerBox.id = "floatingTimerBox";
    timerBox.style.position = "fixed";
    timerBox.style.top = "20px";
    timerBox.style.right = "20px";
    timerBox.style.zIndex = "999999999";
    timerBox.style.background = "#1e1e1e";
    timerBox.style.color = "white";
    timerBox.style.padding = "10px 14px";
    timerBox.style.borderRadius = "10px";
    timerBox.style.boxShadow = "0 6px 20px rgba(0,0,0,0.25)";
    timerBox.style.fontSize = "13px";
    timerBox.style.fontFamily = "Arial, Helvetica, sans-serif";
    timerBox.style.cursor = "move";
    timerBox.style.userSelect = "none";
    timerBox.style.minWidth = "160px";
    timerBox.style.lineHeight = "1.25";

    timerBox.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <div style="font-weight:600">⏱ Work Timer</div>
        <div style="display:flex;gap:6px;align-items:center">
          <button id="kekaTimerMinBtn" title="Minimize" style="background:transparent;border:0;color:#ddd;cursor:pointer;font-size:14px;padding:2px 6px">_</button>
          <button id="kekaTimerCloseBtn" title="Close" style="background:transparent;border:0;color:#ddd;cursor:pointer;font-size:14px;padding:2px 6px">×</button>
        </div>
      </div>
      <div style="margin-top:8px;font-size:12px" id="ft_lines">
        <div id="ft_total">Total: --:--:--</div>
        <div id="ft_left">Left: --:--:--</div>
      </div>
    `;

    document.body.appendChild(timerBox);
    makeDraggable(timerBox);

    // Minimize / Close
    const minBtn = document.getElementById('kekaTimerMinBtn');
    const closeBtn = document.getElementById('kekaTimerCloseBtn');
    const lines = document.getElementById('ft_lines');

    minBtn.onclick = (e) => {
      e.stopPropagation();
      if(lines.style.display === 'none') {
        lines.style.display = 'block';
        minBtn.textContent = '_';
      } else {
        lines.style.display = 'none';
        minBtn.textContent = '+';
      }
    };
    closeBtn.onclick = (e) => {
      e.stopPropagation();
      try { timerBox.remove(); } catch(e){}
      if(floatingTickInterval){ clearInterval(floatingTickInterval); floatingTickInterval = null; }
      // create small tray button so user can restore
      createTrayButton();
    };

    // start tick to update display every second (uses window.KekaHoursLatest)
    if(floatingTickInterval) clearInterval(floatingTickInterval);
    floatingTickInterval = setInterval(() => {
      const latest = window.KekaHoursLatest || null;
      if(!latest) return updateFloatingTimer(0);
      const totalSeconds = Math.round((latest.totalMinutes || 0) * 60);
      updateFloatingTimer(totalSeconds);
    }, 1000);
  }

  function updateFloatingTimer(totalSeconds) {
    const ftTotal = document.getElementById("ft_total");
    const ftLeft  = document.getElementById("ft_left");
    const box = document.getElementById("floatingTimerBox");
    if (!ftTotal || !ftLeft || !box) return;

    let secs = Number(totalSeconds) || 0;
    if(!Number.isFinite(secs) || secs < 0) secs = 0;

    let hrs = Math.floor(secs / 3600);
    let mins = Math.floor((secs % 3600) / 60);
    let s = secs % 60;

    let remaining = (WORK_MINUTES * 60) - secs;
    if(remaining < 0) remaining = 0;

    let rH = Math.floor(remaining / 3600);
    let rM = Math.floor((remaining % 3600) / 60);
    let rS = remaining % 60;

    ftTotal.innerText = `Total: ${hrs}h ${mins}m ${s}s`;
    ftLeft.innerText  = `Left: ${rH}h ${rM}m ${rS}s`;

    // background color change on completion
    if(remaining === 0) {
      box.style.background = "#005eff";
    } else {
      box.style.background = "#1e1e1e";
    }
  }

  // tray/minimized button
  function createTrayButton() {
    // avoid duplicates
    if(document.getElementById('kekaTrayBtn')) return;
    const btn = document.createElement('div');
    btn.id = 'kekaTrayBtn';
    btn.style.position = 'fixed';
    btn.style.bottom = '14px';
    btn.style.right = '14px';
    btn.style.zIndex = '999999999';
    btn.style.width = '44px';
    btn.style.height = '44px';
    btn.style.borderRadius = '10px';
    btn.style.background = 'rgba(15,23,42,0.95)';
    btn.style.color = '#fff';
    btn.style.display = 'flex';
    btn.style.alignItems = 'center';
    btn.style.justifyContent = 'center';
    btn.style.boxShadow = '0 6px 20px rgba(0,0,0,0.25)';
    btn.style.cursor = 'pointer';
    btn.title = 'Restore Work Timer';
    btn.innerText = '⏱';

    btn.onclick = (e) => {
      e.stopPropagation();
      try { btn.remove(); } catch(e){}
      createFloatingTimer();
    };

    document.body.appendChild(btn);
  }

  // Drag logic
  function makeDraggable(el) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    el.onmousedown = dragMouseDown;
    function dragMouseDown(e) {
      e = e || window.event;
      if(e.button !== 0) return;
      pos3 = e.clientX;
      pos4 = e.clientY;
      document.onmouseup = closeDragElement;
      document.onmousemove = elementDrag;
    }
    function elementDrag(e) {
      e = e || window.event;
      pos1 = pos3 - e.clientX;
      pos2 = pos4 - e.clientY;
      pos3 = e.clientX;
      pos4 = e.clientY;
      const newTop = el.offsetTop - pos2;
      const newLeft = el.offsetLeft - pos1;
      const maxLeft = window.innerWidth - el.offsetWidth - 8;
      const maxTop = window.innerHeight - el.offsetHeight - 8;
      el.style.top = Math.min(Math.max(8, newTop), Math.max(8, maxTop)) + "px";
      el.style.left = Math.min(Math.max(8, newLeft), Math.max(8, maxLeft)) + "px";
      el.style.right = 'auto';
    }
    function closeDragElement() {
      document.onmouseup = null;
      document.onmousemove = null;
    }
  }

  /* -----------------------  Observers & Auto Refresh  ------------------------ */
  const findLogsContainer = () => document.querySelector(selLogs);

  const debounce = (fn, wait=180) => {
    let t;
    return function(...a){ clearTimeout(t); t=setTimeout(()=>fn.apply(this,a), wait); };
  };

  let containerObserver = null;
  let containerMutObserver = null;
  let lastContainer = null;
  let refreshInterval = null;

  const cleanupForContainer = () => {
    if(containerMutObserver) containerMutObserver.disconnect();
    containerMutObserver = null;
    if(refreshInterval) clearInterval(refreshInterval);
    refreshInterval = null;
    if(floatingTickInterval) clearInterval(floatingTickInterval);
    floatingTickInterval = null;
    lastContainer = null;
  };

  const evaluateAlerts = (r) => {
    if(!r) return;
    // pre-alert at PRE_ALERT_MINUTES
    if(r.totalMinutes >= PRE_ALERT_MINUTES && !wasNotified('pre_done_date')) {
      notifyPreAlert();
    }
    // final alert at WORK_MINUTES
    if(r.totalMinutes >= WORK_MINUTES && !wasNotified('eight_done_date')) {
      notifyComplete();
    }
  };

  const onContainerReady = debounce((container) => {
    if(!container) return;
    try { createFloatingTimer(); } catch(e){}
    processLogs(container, true);
    renderCards(container);

    if(containerMutObserver) containerMutObserver.disconnect();
    containerMutObserver = new MutationObserver(
      debounce(()=>{
        const r = processLogs(container, true);
        renderCards(container);
        // update floating timer
        try {
          if(window.KekaHoursLatest && typeof window.KekaHoursLatest.totalMinutes === 'number') {
            updateFloatingTimer(Math.round(window.KekaHoursLatest.totalMinutes * 60));
          }
        } catch(e){}
        evaluateAlerts(r);
      },150)
    );
    containerMutObserver.observe(container, { childList: true, subtree: true, attributes: true });

    if(refreshInterval) clearInterval(refreshInterval);
    refreshInterval = setInterval(()=> {
      const r = processLogs(container, true);
      renderCards(container);
      try {
        if(window.KekaHoursLatest && typeof window.KekaHoursLatest.totalMinutes === 'number') {
          updateFloatingTimer(Math.round(window.KekaHoursLatest.totalMinutes * 60));
        }
      } catch(e){}
      evaluateAlerts(r);
    }, 60 * 1000);  // every 1 minute

    lastContainer = container;
  },160);

  if(containerObserver) containerObserver.disconnect();
  containerObserver = new MutationObserver(
    debounce(()=> {
      const container = findLogsContainer();
      if(container && container !== lastContainer) {
        onContainerReady(container);
      } else if(!container && lastContainer) {
        cleanupForContainer();
      }
    },200)
  );
  containerObserver.observe(document.body, { childList:true, subtree:true });

  const existing = findLogsContainer();
  if(existing) onContainerReady(existing);

  window.addEventListener('beforeunload', ()=> {
    cleanupForContainer();
    if(containerObserver) containerObserver.disconnect();
  });

  // create floating timer immediately (even if modal not open) so user sees it at start
  try { if(prefs.showFloatingTimer) createFloatingTimer(); } catch(e){}

  toast('KekaHours: loaded ✓ (floating timer + pre-alert + sound + minimize/tray)');

})();
