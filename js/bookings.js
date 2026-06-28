/* Microworx bookings — vanilla JS calendar.
   Stores bookings in localStorage under "mwx_bookings".
   NOTE: localStorage is per-browser. For real multi-user booking you would
   point saveBooking()/loadBookings() at a backend or form service. */
(function () {
  'use strict';

  var STORAGE_KEY = 'mwx_bookings';
  var MAX_PER_DAY = 4;
  var SLOTS = ['11:00', '11:15', '11:30', '11:45', '12:00', '12:15', '12:30', '12:45'];
  var DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MON_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var MON_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function pad(n) { return String(n).padStart(2, '0'); }
  function isoOf(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function to12h(t) { var p = t.split(':').map(Number); var h = p[0]; return (h > 12 ? h - 12 : h === 0 ? 12 : h) + ':' + pad(p[1]) + (h >= 12 ? ' PM' : ' AM'); }
  function longDate(iso) { var d = new Date(iso + 'T00:00:00'); return DOW_LONG[d.getDay()] + ', ' + MON_LONG[d.getMonth()] + ' ' + d.getDate(); }
  function shortDate(iso) { var d = new Date(iso + 'T00:00:00'); return MON_SHORT[d.getMonth()] + ' ' + d.getDate(); }
  function dowShort(iso) { var d = new Date(iso + 'T00:00:00'); return DOW_SHORT[d.getDay()]; }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  function loadBookings() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch (e) { return {}; } }
  function saveBookings(d) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)); } catch (e) {} }
  function slotTime(b) { return typeof b === 'string' ? b : b.time; }
  function bookedTimes(iso, bk) { return (bk[iso] || []).map(slotTime); }
  function isDayFull(iso, bk) { return (bk[iso] || []).length >= MAX_PER_DAY; }

  function upcomingDays() {
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var out = [];
    for (var i = 1; out.length < 10 && i <= 25; i++) {
      var d = new Date(today); d.setDate(today.getDate() + i);
      if (d.getDay() >= 1 && d.getDay() <= 5) out.push(isoOf(d));
    }
    return out;
  }

  var state = {
    bookings: loadBookings(),
    selectedDate: null,
    selectedTime: null,
    form: { name: '', phone: '', email: '', problem: '' },
    error: '',
    phase: 'book',           // 'book' | 'confirmed' | 'cancel-done'
    confirmation: null,
    cancelOpen: false,
    cancelName: '',
    cancelEmail: '',
    cancelSearched: false,
    cancelKey: null
  };
  var appEl;

  function setState(u) { Object.assign(state, u); render(); }

  /* ---- styles ---- */
  function dayStyle(full, sel) {
    var s = 'display:flex;flex-direction:column;gap:3px;align-items:flex-start;text-align:left;padding:14px 16px;border-radius:8px;transition:all .12s;cursor:' + (full ? 'not-allowed' : 'pointer') + ';';
    if (full) return s + 'border:1px solid #E5D8D0;background:#EDE0D8;color:#B8AEB0;';
    if (sel) return s + 'border:2px solid #7A1F2B;background:#FBF1F2;color:#7A1F2B;box-shadow:0 4px 14px rgba(122,31,43,.14);';
    return s + 'border:1px solid #DFD0C8;background:#FAF3EF;color:#3A3236;';
  }
  function slotStyle(taken, sel) {
    var s = "font-family:'Archivo',sans-serif;font-weight:600;font-size:13px;padding:10px 4px;border-radius:6px;transition:all .12s;cursor:" + (taken ? 'not-allowed' : 'pointer') + ';';
    if (taken) return s + 'border:1px solid #E5D8D0;background:#EDE0D8;color:#C3B9BB;text-decoration:line-through;';
    if (sel) return s + 'border:2px solid #7A1F2B;background:#7A1F2B;color:#fff;';
    return s + 'border:1px solid #DFD0C8;background:#FAF3EF;color:#3A3236;';
  }
  function inputStyle() { return 'width:100%;padding:13px 15px;border:1px solid #D4C9C2;border-radius:6px;font-size:15px;color:#241C1F;outline:none;box-sizing:border-box;background:#fff;'; }

  /* ---- build HTML ---- */
  function buildHTML() {
    if (state.phase === 'confirmed' && state.confirmation) return confirmedHTML();
    if (state.phase === 'cancel-done') return cancelDoneHTML();
    return bookHTML();
  }

  function bookHTML() {
    return '<div style="display:grid;grid-template-columns:1fr 1fr;gap:28px;align-items:start;">' +
      calendarHTML() + sideHTML() + '</div>' + cancelHTML();
  }

  function calendarHTML() {
    var days = upcomingDays();
    var h = '<div><div style="font-family:\'Archivo\',sans-serif;font-weight:700;font-size:15px;color:#241C1F;margin-bottom:16px;">1&nbsp;&nbsp;Pick a day</div>';
    h += '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;">';
    days.forEach(function (iso) {
      var full = isDayFull(iso, state.bookings);
      var sel = iso === state.selectedDate;
      var remaining = MAX_PER_DAY - (state.bookings[iso] || []).length;
      h += '<button type="button" data-act="day" data-iso="' + iso + '"' + (full ? ' disabled' : '') + ' style="' + dayStyle(full, sel) + '">' +
        '<span style="font-family:\'Archivo\',sans-serif;font-weight:600;font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.7;">' + dowShort(iso) + '</span>' +
        '<span style="font-family:\'Archivo\',sans-serif;font-weight:800;font-size:22px;line-height:1.1;">' + shortDate(iso) + '</span>' +
        '<span style="font-size:11.5px;opacity:.75;">' + (full ? 'Full' : remaining + ' left') + '</span>' +
        '</button>';
    });
    return h + '</div></div>';
  }

  function sideHTML() {
    var h = '<div style="background:#F5EDE6;border:1px solid #DFD0C8;border-radius:10px;padding:28px;position:sticky;top:92px;">';
    if (!state.selectedDate) {
      h += '<div style="text-align:center;padding:40px 12px;color:#A89498;"><div style="font-size:38px;margin-bottom:12px;">&#128197;</div><div style="font-size:15px;color:#8C858A;line-height:1.5;">Select a day on the left to see available times.</div></div>';
    } else {
      h += slotsHTML() + formHTML();
    }
    return h + '</div>';
  }

  function slotsHTML() {
    var booked = bookedTimes(state.selectedDate, state.bookings);
    var full = isDayFull(state.selectedDate, state.bookings);
    var h = '<div style="font-family:\'Archivo\',sans-serif;font-weight:700;font-size:15px;color:#241C1F;margin-bottom:4px;">2&nbsp;&nbsp;Pick a time</div>' +
      '<div style="font-size:14px;color:#8C858A;margin-bottom:16px;">' + longDate(state.selectedDate) + '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:26px;">';
    SLOTS.forEach(function (t) {
      var taken = booked.indexOf(t) !== -1 || full;
      var sel = state.selectedTime === t;
      h += '<button type="button" data-act="time" data-time="' + t + '"' + (taken ? ' disabled' : '') + ' style="' + slotStyle(taken, sel) + '">' + to12h(t) + '</button>';
    });
    return h + '</div>';
  }

  function formHTML() {
    var f = state.form, len = f.problem.length;
    var h = '<div style="font-family:\'Archivo\',sans-serif;font-weight:700;font-size:15px;color:#241C1F;margin-bottom:16px;">3&nbsp;&nbsp;Your details</div><div style="display:grid;gap:12px;">' +
      '<input id="bk-name" type="text" placeholder="Full name" value="' + esc(f.name) + '" data-field="name" style="' + inputStyle() + '">' +
      '<input id="bk-phone" type="tel" placeholder="Phone number" value="' + esc(f.phone) + '" data-field="phone" style="' + inputStyle() + '">' +
      '<input id="bk-email" type="email" placeholder="Email address" value="' + esc(f.email) + '" data-field="email" style="' + inputStyle() + '">' +
      '<div><textarea id="bk-problem" data-field="problem" placeholder="Briefly describe your problem" maxlength="80" rows="2" style="' + inputStyle() + 'resize:none;">' + esc(f.problem) + '</textarea>' +
      '<div id="bk-count" style="font-size:12px;color:' + (len >= 75 ? '#B0303E' : '#A89498') + ';text-align:right;margin-top:3px;">' + len + '/80</div></div></div>';
    if (state.error) h += '<div style="margin-top:14px;font-size:13.5px;color:#B0303E;background:#FBEDEE;border:1px solid #F2D5D8;padding:10px 14px;border-radius:6px;">' + esc(state.error) + '</div>';
    h += '<button type="button" data-act="submit" style="margin-top:20px;width:100%;font-family:\'Archivo\',sans-serif;font-weight:600;font-size:16px;color:#fff;background:#7A1F2B;border:none;padding:15px;border-radius:6px;box-shadow:0 4px 14px rgba(122,31,43,.25);cursor:pointer;">Confirm booking</button>';
    h += '<div style="margin-top:10px;font-size:12px;color:#A89498;line-height:1.5;text-align:center;">A $100 diagnostic fee is due at check-in. Extra time billed in 15-min increments at $100/hr with your approval.</div>';
    return h;
  }

  function cancelHTML() {
    var h = '<div style="margin-top:16px;">';
    if (!state.cancelOpen) {
      h += '<button type="button" data-act="open-cancel" style="width:100%;font-family:\'Archivo\',sans-serif;font-weight:600;font-size:13.5px;color:#9A6A5E;background:transparent;border:1px dashed #D4C9C2;padding:11px;border-radius:6px;cursor:pointer;">Changed your mind? Cancel your appointment &#8594;</button>';
    } else if (!state.cancelSearched) {
      h += cancelSearchHTML();
    } else {
      h += cancelListHTML();
    }
    return h + '</div>';
  }

  function cancelSearchHTML() {
    var ok = state.cancelName.trim() && state.cancelEmail.trim();
    return '<div style="background:#F5EDE6;border:1px solid #DFD0C8;border-radius:8px;padding:18px;">' +
      '<div style="font-family:\'Archivo\',sans-serif;font-weight:700;font-size:14px;color:#241C1F;margin-bottom:4px;">Find your appointment</div>' +
      '<div style="font-size:12.5px;color:#8C858A;margin-bottom:12px;line-height:1.45;">Enter the name and email you booked with.</div>' +
      '<div style="display:flex;flex-direction:column;gap:9px;margin-bottom:12px;">' +
      '<input id="cn-name" type="text" placeholder="Full name" value="' + esc(state.cancelName) + '" data-cfield="cancelName" style="' + inputStyle() + '">' +
      '<input id="cn-email" type="email" placeholder="Email address" value="' + esc(state.cancelEmail) + '" data-cfield="cancelEmail" style="' + inputStyle() + '"></div>' +
      '<div style="display:flex;gap:10px;">' +
      '<button type="button" data-act="find"' + (ok ? '' : ' disabled') + ' style="flex:1;font-family:\'Archivo\',sans-serif;font-weight:600;font-size:14px;color:' + (ok ? '#fff' : '#C3B9BB') + ';background:' + (ok ? '#7A1F2B' : '#E5D8D0') + ';border:none;padding:12px;border-radius:6px;cursor:' + (ok ? 'pointer' : 'default') + ';">Find my appointments</button>' +
      '<button type="button" data-act="close-cancel" style="font-family:\'Archivo\',sans-serif;font-weight:600;font-size:14px;color:#9A6A5E;background:transparent;border:none;padding:12px;cursor:pointer;">Never mind</button>' +
      '</div></div>';
  }

  function cancelListHTML() {
    var name = state.cancelName.trim().toLowerCase();
    var email = state.cancelEmail.trim().toLowerCase();
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var mine = [];
    Object.keys(state.bookings).forEach(function (iso) {
      if (new Date(iso + 'T00:00:00') < today) return;
      (state.bookings[iso] || []).forEach(function (b) {
        if (typeof b === 'string') { mine.push({ key: iso + '|' + b, label: longDate(iso) + ' at ' + to12h(b) }); return; }
        if ((b.name || '').trim().toLowerCase() === name && (b.email || '').trim().toLowerCase() === email) {
          mine.push({ key: iso + '|' + b.time, label: longDate(iso) + ' at ' + to12h(b.time) });
        }
      });
    });
    mine.sort(function (a, b) { return a.key < b.key ? -1 : 1; });

    var h = '<div style="background:#F5EDE6;border:1px solid #DFD0C8;border-radius:8px;padding:18px;">';
    if (!mine.length) {
      h += '<div style="font-size:13.5px;color:#6E6669;line-height:1.5;margin-bottom:12px;">No upcoming appointments found for <strong>' + esc(state.cancelName) + '</strong>.</div>' +
        '<div style="display:flex;gap:10px;justify-content:center;">' +
        '<button type="button" data-act="retry" style="font-family:\'Archivo\',sans-serif;font-weight:600;font-size:14px;color:#7A1F2B;background:transparent;border:1.5px solid #D4C9C2;padding:10px 18px;border-radius:6px;cursor:pointer;">Try again</button>' +
        '<button type="button" data-act="close-cancel" style="font-family:\'Archivo\',sans-serif;font-weight:600;font-size:14px;color:#9A6A5E;background:transparent;border:none;padding:10px;cursor:pointer;">Never mind</button></div>';
    } else {
      h += '<div style="font-family:\'Archivo\',sans-serif;font-weight:700;font-size:14px;color:#241C1F;margin-bottom:10px;">Which appointment would you like to cancel?</div><div style="display:flex;flex-direction:column;gap:7px;margin-bottom:12px;">';
      mine.forEach(function (m) {
        var sel = state.cancelKey === m.key;
        h += '<button type="button" data-act="pick" data-key="' + esc(m.key) + '" style="font-family:\'Archivo\',sans-serif;font-weight:600;font-size:13.5px;padding:10px 14px;border-radius:6px;cursor:pointer;text-align:left;border:' + (sel ? '2px solid #7A1F2B' : '1px solid #DFD0C8') + ';background:' + (sel ? '#FBF1F2' : '#FAF3EF') + ';color:' + (sel ? '#7A1F2B' : '#3A3236') + ';">' + m.label + '</button>';
      });
      var can = !!state.cancelKey;
      h += '</div><div style="display:flex;gap:10px;">' +
        '<button type="button" data-act="do-cancel"' + (can ? '' : ' disabled') + ' style="flex:1;font-family:\'Archivo\',sans-serif;font-weight:600;font-size:14px;color:' + (can ? '#fff' : '#C3B9BB') + ';background:' + (can ? '#7A1F2B' : '#E5D8D0') + ';border:none;padding:12px;border-radius:6px;cursor:' + (can ? 'pointer' : 'default') + ';">Cancel this appointment</button>' +
        '<button type="button" data-act="close-cancel" style="font-family:\'Archivo\',sans-serif;font-weight:600;font-size:14px;color:#9A6A5E;background:transparent;border:none;padding:12px;cursor:pointer;">Never mind</button></div>';
    }
    return h + '</div>';
  }

  function confirmedHTML() {
    var c = state.confirmation;
    return '<div style="background:#F5EDE6;border:1px solid #DFD0C8;border-radius:11px;padding:48px;text-align:center;">' +
      '<div style="width:64px;height:64px;border-radius:50%;background:#1F7A4D;color:#fff;display:flex;align-items:center;justify-content:center;font-size:32px;margin:0 auto 22px;">&#10003;</div>' +
      '<h2 style="font-family:\'Archivo\',sans-serif;font-weight:800;font-size:28px;letter-spacing:-0.02em;margin:0 0 10px;color:#241C1F;">You&rsquo;re booked!</h2>' +
      '<p style="font-size:17px;color:#5C5559;margin:0 0 24px;">' + esc(c.name) + ', we&rsquo;ll see you on <strong style="color:#241C1F;">' + c.date + '</strong> at <strong style="color:#241C1F;">' + c.time + '</strong>.</p>' +
      '<div style="background:#FAF3EF;border:1px solid #DFD0C8;border-radius:7px;padding:18px 22px;display:inline-block;text-align:left;margin-bottom:28px;"><div style="font-size:14px;color:#6E6669;line-height:1.7;">' +
      '<div><strong style="color:#241C1F;">Where:</strong> 20 Allen&rsquo;s Creek Rd, Rochester</div>' +
      '<div><strong style="color:#241C1F;">Bring:</strong> your device, charger &amp; any passwords</div>' +
      '<div><strong style="color:#241C1F;">Due at check-in:</strong> $100 diagnostic fee</div>' +
      '<div><strong style="color:#241C1F;">Questions?</strong> Call 585-271-0050</div></div></div>' +
      '<div><button type="button" data-act="book-another" style="font-family:\'Archivo\',sans-serif;font-weight:600;font-size:15px;color:#7A1F2B;background:transparent;border:1.5px solid #D9C4C6;padding:13px 26px;border-radius:6px;cursor:pointer;">Book another slot</button></div></div>';
  }

  function cancelDoneHTML() {
    return '<div style="background:#F5EDE6;border:1px solid #DFD0C8;border-radius:11px;padding:48px;text-align:center;">' +
      '<div style="width:64px;height:64px;border-radius:50%;background:#7A1F2B;color:#fff;display:flex;align-items:center;justify-content:center;font-size:30px;margin:0 auto 22px;">&#10005;</div>' +
      '<h2 style="font-family:\'Archivo\',sans-serif;font-weight:800;font-size:28px;letter-spacing:-0.02em;margin:0 0 10px;color:#241C1F;">Appointment cancelled.</h2>' +
      '<p style="font-size:17px;color:#5C5559;margin:0 auto 28px;max-width:30em;">That time slot is now free for someone else &mdash; thanks for letting us know. Need a different time?</p>' +
      '<div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">' +
      '<button type="button" data-act="reset" style="font-family:\'Archivo\',sans-serif;font-weight:600;font-size:15px;color:#fff;background:#7A1F2B;border:none;padding:13px 26px;border-radius:6px;cursor:pointer;">Book a new slot</button>' +
      '<a href="tel:5852710050" style="font-family:\'Archivo\',sans-serif;font-weight:600;font-size:15px;color:#7A1F2B;background:transparent;border:1.5px solid #D9C4C6;padding:13px 26px;border-radius:6px;text-decoration:none;">Call the shop</a></div></div>';
  }

  /* ---- render with focus preservation ---- */
  function render() {
    if (!appEl) return;
    var act = document.activeElement;
    var id = act && act.id ? act.id : null;
    var start = act && act.selectionStart != null ? act.selectionStart : null;
    var end = act && act.selectionEnd != null ? act.selectionEnd : null;
    appEl.innerHTML = buildHTML();
    if (id) {
      var el = document.getElementById(id);
      if (el) { el.focus(); if (start != null && el.setSelectionRange) { try { el.setSelectionRange(start, end); } catch (e) {} } }
    }
  }

  /* ---- events ---- */
  function onClick(e) {
    var btn = e.target.closest('[data-act]');
    if (!btn || btn.disabled) return;
    var a = btn.getAttribute('data-act');
    if (a === 'day') setState({ selectedDate: btn.getAttribute('data-iso'), selectedTime: null, error: '' });
    else if (a === 'time') setState({ selectedTime: btn.getAttribute('data-time'), error: '' });
    else if (a === 'submit') submit();
    else if (a === 'book-another') setState({ phase: 'book', confirmation: null, selectedDate: null, selectedTime: null, form: { name: '', phone: '', email: '', problem: '' }, error: '' });
    else if (a === 'reset') setState({ phase: 'book', selectedDate: null, selectedTime: null, cancelOpen: false, cancelSearched: false, cancelName: '', cancelEmail: '', cancelKey: null });
    else if (a === 'open-cancel') setState({ cancelOpen: true });
    else if (a === 'close-cancel') setState({ cancelOpen: false, cancelSearched: false, cancelName: '', cancelEmail: '', cancelKey: null });
    else if (a === 'find') setState({ cancelSearched: true });
    else if (a === 'retry') setState({ cancelSearched: false, cancelKey: null });
    else if (a === 'pick') setState({ cancelKey: btn.getAttribute('data-key') });
    else if (a === 'do-cancel') doCancel();
  }

  function onInput(e) {
    var el = e.target;
    if (el.dataset.field) {
      var v = el.dataset.field === 'problem' ? el.value.slice(0, 80) : el.value;
      state.form[el.dataset.field] = v;
      if (el.dataset.field === 'problem') {
        var c = document.getElementById('bk-count');
        if (c) { c.textContent = v.length + '/80'; c.style.color = v.length >= 75 ? '#B0303E' : '#A89498'; }
      }
    } else if (el.dataset.cfield) {
      state[el.dataset.cfield] = el.value;
      var fb = appEl.querySelector('[data-act="find"]');
      if (fb) {
        var ok = state.cancelName.trim() && state.cancelEmail.trim();
        fb.disabled = !ok; fb.style.color = ok ? '#fff' : '#C3B9BB'; fb.style.background = ok ? '#7A1F2B' : '#E5D8D0'; fb.style.cursor = ok ? 'pointer' : 'default';
      }
    }
  }

  function submit() {
    var f = state.form;
    if (!state.selectedTime) return setState({ error: 'Please choose a time slot.' });
    if (!f.name.trim()) return setState({ error: 'Please enter your name.' });
    if (f.phone.replace(/\D/g, '').length < 7) return setState({ error: 'Please enter a valid phone number.' });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) return setState({ error: 'Please enter a valid email address.' });
    var next = Object.assign({}, state.bookings);
    next[state.selectedDate] = (next[state.selectedDate] || []).concat([{ time: state.selectedTime, name: f.name.trim(), email: f.email.trim().toLowerCase(), phone: f.phone.trim(), problem: f.problem.trim() }]);
    saveBookings(next);
    setState({
      bookings: next, phase: 'confirmed',
      confirmation: { name: f.name.trim(), date: longDate(state.selectedDate), time: to12h(state.selectedTime) },
      selectedDate: null, selectedTime: null, form: { name: '', phone: '', email: '', problem: '' }, error: ''
    });
  }

  function doCancel() {
    if (!state.cancelKey) return;
    var parts = state.cancelKey.split('|'), iso = parts[0], t = parts[1];
    var email = state.cancelEmail.trim().toLowerCase();
    var next = Object.assign({}, state.bookings);
    next[iso] = (next[iso] || []).filter(function (b) {
      if (slotTime(b) !== t) return true;
      if (typeof b === 'string') return false;
      return (b.email || '').trim().toLowerCase() !== email;
    });
    if (!next[iso] || !next[iso].length) delete next[iso];
    saveBookings(next);
    setState({ bookings: next, phase: 'cancel-done', cancelOpen: false, cancelSearched: false, cancelName: '', cancelEmail: '', cancelKey: null });
  }

  function scheduleMidnight() {
    var now = new Date(), m = new Date(now); m.setHours(24, 0, 0, 0);
    setTimeout(function () {
      var today = new Date(); today.setHours(0, 0, 0, 0);
      if (state.selectedDate && new Date(state.selectedDate + 'T00:00:00') < today) { state.selectedDate = null; state.selectedTime = null; }
      render(); scheduleMidnight();
    }, m - now);
  }

  document.addEventListener('DOMContentLoaded', function () {
    appEl = document.getElementById('booking-app');
    if (!appEl) return;
    appEl.addEventListener('click', onClick);
    appEl.addEventListener('input', onInput);
    render();
    scheduleMidnight();
  });
})();
