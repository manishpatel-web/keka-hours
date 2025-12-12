// keka-hours-autoupdate-breaks-right-side.js
(function(){
  'use strict';

  const toast = (msg, ttl=1200) => {
    try {
      const n = document.createElement('div');
      n.textContent = msg;
      n.style.cssText = 'position:fixed;top:14px;right:14px;z-index:2147483647;background:#0f172a;color:#fff;padding:8px 12px;border-radius:8px;font-size:13px;font-family:sans-serif;box-shadow:0 6px 18px rgba(0,0,0,0.25)';
      document.body.appendChild(n);
      setTimeout(()=>{ n.style.opacity='0'; setTimeout(()=>n.remove(),220); }, ttl);
    } catch(e){}
  };

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

      // render per-row break badge (right-aligned)
      if(renderRowBadges && idx !== 0) {
        // ensure row is position relative so absolute chip can be anchored
        try { row.style.position = row.style.position || 'relative'; } catch(e){}
        // find existing chip
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
            // append to row (absolute will position relative to row)
            row.appendChild(chip);
          } else {
            chip.textContent = chipText;
          }
        } else {
          // if break is 0 and chip exists, remove it
          if(chip && chip.parentNode) chip.parentNode.removeChild(chip);
        }
      }

      prevEnd = e;
    });

    return {
      totalMinutes: totalM,
      totalHuman: `${Math.floor(totalM/60)} Hr ${totalM%60} Min`,
      firstStart,
      breakMinutes: breakM,
      rows: rowDetails,
      overtimeMinutes: Math.max(0, totalM - 8*60),
      remainingMinutes: Math.max(0, 8*60 - totalM)
    };
  }

  function renderCards(container){
    const r = processLogs(container, false);
    if(!r) return;
    const completionDate = (function(){
      if(!r.firstStart) return 'N/A';
      const st = parseTime(r.firstStart);
      if(!st) return 'N/A';
      const base = new Date(); base.setHours(st.hours, st.minutes, 0, 0);
      const comp = new Date(base.getTime() + (8*60 + r.breakMinutes) * 60 * 1000);
      let s = comp.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', hour12:true });
      if(r.totalMinutes >= 480) s += ' (Completed ✓)';
      return s;
    })();

    const overtimeStr = r.overtimeMinutes > 0 ? `${Math.floor(r.overtimeMinutes/60)} Hr ${r.overtimeMinutes%60} Min` : 'No overtime';
    const remainingStr = r.remainingMinutes <= 0 ? '8 hours completed! 🎉' : `${Math.floor(r.remainingMinutes/60)}h ${r.remainingMinutes%60}m`;

    // dynamic background for Overtime/Remaining block
    const isCompleted = r.remainingMinutes <= 0;
    const overRemainBg = isCompleted
      ? 'linear-gradient(135deg,#10b981,#059669)'   // green when completed
      : 'linear-gradient(135deg,#ef4444,#dc2626)';  // red when not completed

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

    wrapper.querySelectorAll('div[style]').forEach(el=>{
      el.onclick = ()=> {
        try { navigator.clipboard.writeText(el.innerText); toast('Copied to clipboard') } catch(e){ toast('Copy failed') }
      };
    });

    window.KekaHoursLatest = r;
  }

  // observe modal and changes + add refresh interval
  function findLogsContainer(){ return document.querySelector(selLogs); }
  function debounce(fn, wait=180){ let t; return function(...a){ clearTimeout(t); t=setTimeout(()=>fn.apply(this,a), wait); }; }

  let containerObserver = null;
  let containerMutObserver = null;
  let lastContainer = null;
  let refreshInterval = null;

  const cleanupForContainer = () => {
    if(containerMutObserver){ containerMutObserver.disconnect(); containerMutObserver = null; }
    if(refreshInterval){ clearInterval(refreshInterval); refreshInterval = null; }
    lastContainer = null;
  };

  const onContainerReady = debounce((container) => {
    if(!container) return;
    // build per-row chips then cards
    processLogs(container, true);
    renderCards(container);

    // attach mutation observer to update on DOM changes
    if(containerMutObserver) containerMutObserver.disconnect();
    containerMutObserver = new MutationObserver(debounce(()=> {
      processLogs(container, true);
      renderCards(container);
    }, 150));
    containerMutObserver.observe(container, { childList: true, subtree: true, attributes: true });

    // set up refresh interval (every 60s) to update Remaining/Overtime even when DOM doesn't change
    if(refreshInterval) clearInterval(refreshInterval);
    refreshInterval = setInterval(()=> {
      processLogs(container, true);
      renderCards(container);
    }, 60*1000);

    lastContainer = container;
  }, 160);

  if(containerObserver) containerObserver.disconnect();
  containerObserver = new MutationObserver(debounce(()=> {
    const container = findLogsContainer();
    if(container && container !== lastContainer) {
      onContainerReady(container);
    } else if(!container && lastContainer){
      cleanupForContainer();
    }
  }, 200));
  containerObserver.observe(document.body, { childList: true, subtree: true });

  // immediate if already open
  const existing = findLogsContainer();
  if(existing) onContainerReady(existing);

  // cleanup on page unload
  window.addEventListener('beforeunload', ()=>{ cleanupForContainer(); if(containerObserver) containerObserver.disconnect(); });

  toast('KekaHours: loaded (break chip right-aligned + live refresh)');
})();
