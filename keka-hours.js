// keka-hours-autoupdate-breaks-right-side.js (with 8-hour notification + floating timer)
(function(){
  'use strict';

  /* -----------------------  Toast Utility  ------------------------ */
  const toast = (msg, ttl=1200) => {
    try {
      const n = document.createElement('div');
      n.textContent = msg;
      n.style.cssText = 'position:fixed;top:14px;right:14px;z-index:2147483647;background:#0f172a;color:#fff;padding:8px 12px;border-radius:8px;font-size:13px;font-family:sans-serif;box-shadow:0 6px 18px rgba(0,0,0,0.25)';
      document.body.appendChild(n);
      setTimeout(()=>{ n.style.opacity='0'; setTimeout(()=>n.remove(),220); }, ttl);
    } catch(e){}
  };

  /* -----------------------  Notification Permission  ------------------------ */
  if (Notification && Notification.permission !== "granted") {
    Notification.requestPermission();
  }

  /* -----------------------  Notify on 8-Hour Completion  ------------------------ */
  let eightHourNotified = false;

  function show8HourNotification() {
    try {
      if (Notification && Notification.permission === "granted") {
        new Notification("🎉 8 Hours Completed!", {
          body: "You have completed your total 8 working hours today.",
          icon: "https://cdn-icons-png.flaticon.com/512/992/992700.png"
        });
      }
    } catch(e){}

    toast("🎉 8 Hours Completed!");
  }

  /* -----------------------  Helpers  ------------------------ */
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

  /* -----------------------  Floating Timer Widget ------------------------ */
  let floatingTickInterval = null;

  function createFloatingTimer() {
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
    timerBox.style.minWidth = "150px";
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
    };

    // start tick to update display every second (uses window.KekaHoursLatest)
    if(floatingTickInterval) clearInterval(floatingTickInterval);
    floatingTickInterval = setInterval(() => {
      const latest = window.KekaHoursLatest || null;
      if(!latest) {
        updateFloatingTimer(0);
        return;
      }
      // If latest.totalMinutes exists, derive seconds; else 0.
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

    let remaining = (8 * 3600) - secs;
    if(remaining < 0) remaining = 0;

    let rH = Math.floor(remaining / 3600);
    let rM = Math.floor((remaining % 3600) / 60);
    let rS = remaining % 60;

    ftTotal.innerText = `Total: ${hrs}h ${mins}m ${s}s`;
    ftLeft.innerText  = `Left: ${rH}h ${rM}m ${rS}s`;

    // background color change when completed
    if(remaining === 0) {
      box.style.background = "#005eff"; // blue when completed
    } else {
      box.style.background = "#1e1e1e";
    }
  }

  // Drag logic
  function makeDraggable(el) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    el.onmousedown = dragMouseDown;
    function dragMouseDown(e) {
      e = e || window.event;
      // only left click
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
      // compute new position
      const newTop = el.offsetTop - pos2;
      const newLeft = el.offsetLeft - pos1;
      // keep within viewport bounds
      const maxLeft = window.innerWidth - el.offsetWidth - 8;
      const maxTop = window.innerHeight - el.offsetHeight - 8;
      el.style.top = Math.min(Math.max(8, newTop), Math.max(8, maxTop)) + "px";
      el.style.left = Math.min(Math.max(8, newLeft), Math.max(8, maxLeft)) + "px";
      // unset right to allow left positioning persistence
      el.style.right = 'auto';
    }
    function closeDragElement() {
      document.onmouseup = null;
      document.onmousemove = null;
    }
  }

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

    // update global for timer usage
    const result = {
      totalMinutes: totalM,
      totalHuman: `${Math.floor(totalM/60)} Hr ${totalM%60} Min`,
      firstStart,
      breakMinutes: breakM,
      rows: rowDetails,
      overtimeMinutes: Math.max(0, totalM - 8*60),
      remainingMinutes: Math.max(0, 8*60 - totalM)
    };

    // store latest for floating tick
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

      const base = new Date();
      base.setHours(st.hours, st.minutes, 0, 0);

      const comp = new Date(base.getTime() + (8*60 + r.breakMinutes) * 60 * 1000);

      let s = comp.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', hour12:true });
      if(r.totalMinutes >= 480) s += ' (Completed ✓)';
      return s;
    })();

    const overtimeStr = r.overtimeMinutes > 0 ? `${Math.floor(r.overtimeMinutes/60)} Hr ${r.overtimeMinutes%60} Min` : 'No overtime';
    const remainingStr = r.remainingMinutes <= 0 ? '8 hours completed! 🎉' : `${Math.floor(r.remainingMinutes/60)}h ${r.remainingMinutes%60}m`;

    const isCompleted = r.remainingMinutes <= 0;
    const overRemainBg = isCompleted
      ? 'linear-gradient(135deg,#10b981,#059669)'
      : 'linear-gradient(135deg,#ef4444,#dc2626)';

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
    `;

    wrapper.querySelectorAll('div[style]').forEach(el => {
      el.onclick = () => {
        try {
          navigator.clipboard.writeText(el.innerText);
          toast('Copied to clipboard');
        } catch(e){
          toast('Copy failed');
        }
      };
    });
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

  const onContainerReady = debounce((container) => {
    if(!container) return;

    // ensure floating timer exists
    try { createFloatingTimer(); } catch(e){}

    processLogs(container, true);
    renderCards(container);

    if(containerMutObserver) containerMutObserver.disconnect();

    containerMutObserver = new MutationObserver(
      debounce(()=>{
        const r = processLogs(container, true);
        renderCards(container);

        // update floating timer using latest
        try {
          if(window.KekaHoursLatest && typeof window.KekaHoursLatest.totalMinutes === 'number') {
            updateFloatingTimer(Math.round(window.KekaHoursLatest.totalMinutes * 60));
          }
        } catch(e){}

        if(r && r.totalMinutes >= 480 && !eightHourNotified) {
          eightHourNotified = true;
          show8HourNotification();
        }
      },150)
    );

    containerMutObserver.observe(container, { childList: true, subtree: true, attributes: true });

    if(refreshInterval) clearInterval(refreshInterval);

    refreshInterval = setInterval(()=> {
      const r = processLogs(container, true);
      renderCards(container);

      // update floating timer using latest
      try {
        if(window.KekaHoursLatest && typeof window.KekaHoursLatest.totalMinutes === 'number') {
          updateFloatingTimer(Math.round(window.KekaHoursLatest.totalMinutes * 60));
        }
      } catch(e){}

      if(r && r.totalMinutes >= 480 && !eightHourNotified) {
        eightHourNotified = true;
        show8HourNotification();
      }
    }, 60 * 1000);  // run every 1 minute

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
  try { createFloatingTimer(); } catch(e){}

  toast('KekaHours: loaded ✓ (break chips + live refresh + 8-hour notifier + floating timer)');
})();
