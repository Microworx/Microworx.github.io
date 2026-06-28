/* Microworx bookings — vanilla JS calendar with Supabase backend.
   window.MWX_SUPABASE_URL and window.MWX_SUPABASE_ANON_KEY are injected
   by the Hugo layout from hugo.toml [params]. */
(function () {
  'use strict';

  var SUPABASE_URL = (window.MWX_SUPABASE_URL || '').replace(/\/$/, '');
  var SUPABASE_KEY = window.MWX_SUPABASE_ANON_KEY || '';
  var REST = SUPABASE_URL + '/rest/v1/';

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

  function upcomingDays() {
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var out = [];
    for (var i = 1; out.length < 10 && i <= 25; i++) {
      var d = new Date(today); d.setDate(today.getDate() + i);
      if (d.getDay() >= 1 && d.getDay() <= 5) out.push(isoOf(d));
    }
    return out;
  }

  /* ---- Supabase REST ---- */
  function sbHeaders(extra) {
    return Object.assign({ 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }, extra || {});
  }
  function sbGet(path) { return fetch(REST + path, { headers: sbHeaders() }); }
  function sbPost(path, body) {
    return fetch(REST + path, {
      method: 'POST',
      headers: sbHeaders({ 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }),
      body: JSON.stringify(body)
    });
  }
  function sbDelete(path) { return fetch(REST + path, { method: 'DELETE', headers: sbHeaders() }); }

  async function fetchAvailability() {
    var today = isoOf(new Date());
    var resp = await sbGet('bookings?select=date,slot&date=gte.' + today + '&order=date,slot');
    if (!resp.ok) throw new Error('load');
    var rows = await resp.json();
    var out = {};
    rows.forEach(function (r) {
      if (!out[r.date]) out[r.date] = [];
      out[r.date].push({ time: r.slot });
    });
    return out;
  }

  /* ---- state ---- */
  var state = {
    initialized: false,
    loading: false,
    bookings: {},
    selectedDate: null,
    selectedTime: null,
    form: { name: '', phone: '', email: '', problem: '' },
    error: '',
    phase: 'book',
    confirmation: null,
    cancelOpen: false,
    cancelName: '',
    cancelEmail: '',
    cancelSearched: false,
    cancelResults: [],
    cancelKey: null
  };
  var appEl;

  function setState(u) { Object.assign(state, u); render(); }

  /* ---- styles ---- */
  function dayStyle(full, sel) {
    var s = 'display:flex;flex-direction:column;gap:3px;align-items:flex-start;text-align:left;padding:14px 16px;border-radius:8px;transition:all .12s;cursor:' + (full ? 'not-allowed' : 'pointer') + ';';
    if (full) return s + 'border:1px solid #E5D8D0;background:#EDE0D8;color:#B8AEB0;';
    if (sel)  return s + 'border:2px solid #7A1F2B;background:#FBF1F2;color:#7A1F2B;box-shadow:0 4px 14px rgba(122,31,43,.14);';
    return s + 'border:1px solid #DFD0C8;background:#FAF3EF;color:#3A3236;';
  }
  function slotStyle(taken, sel) {
    var s = "font-family:'Archivo',sans-serif;font-weight:600;font-size:13px;padding:10px 4px;border-radius:6px;transition:all .12s;cursor:" + (taken ? 'not-allowed' : 'pointer') + ';';
    if (taken) return s + 'border:1px solid #E5D8D0;background:#EDE0D8;color:#C3B9BB;text-decoration:line-through;';
    if (sel)   return s + 'border:2px solid #7A1F2B;background:#7A1F2B;color:#fff;';
    return s + 'border:1px solid #DFD0C8;background:#FAF3EF;color:#3A3236;';
  }
  function inputStyle() { return 'width:100%;padding:13px 15px;border:1px solid #D4C9C2;border-radius:6px;font-size:15px;color:#241C1F;outline:none;box-sizing:border-box;background:#fff;'; }
  function btnPrimary(disabled) {
    return "font-family:'Archivo',sans-serif;font-weight:600;font-size:14px;color:" + (disabled ? '#C3B9BB' : '#fff') + ';background:' + (disabled ? '#E5D8D0' : '#7A1F2B') + ';border:none;padding:12px;border-radius:6px;cursor:' + (disabled ? 'default' : 'pointer') + ';flex:1;';
  }
  function btnGhost() { return "font-family:'Archivo',sans-serif;font-weight:600;font-size:14px;color:#9A6A5E;background:transparent;border:none;padding:12px;cursor:pointer;"; }

  /* ---- HTML builders ---- */
  function buildHTML() {
    if (!state.initialized) return spinnerHTML('Loading availability\u2026');
    if (state.phase === 'confirmed' && state.confirmation) return confirmedHTML();
    if (state.phase === 'cancel-done') return cancelDoneHTML();
    return bookHTML();
  }

  function spinnerHTML(msg) {
    return '<div style="text-align:center;padding:60px 24px;color:#8C858A;">' +
      '<div style="font-size:32px;margin-bottom:14px;animation:mwx-spin 1.2s linear infinite;display:inline-block;">&#8635;</div>' +
      '<style>@keyframes mwx-spin{to{transform:rotate(360deg)}}</style>' +
      '<div style="font-family:\'Archivo\',sans-serif;font-size:15px;margin-top:4px;">' + esc(msg) + '</div></div>';
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
      var count = (state.bookings[iso] || []).length;
      var full = count >= MAX_PER_DAY;
      var sel = iso === state.selectedDate;
      var remaining = MAX_PER_DAY - count;
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
    var booked = (state.bookings[state.selectedDate] || []).map(function (b) { return b.time; });
    var full = (state.bookings[state.selectedDate] || []).length >= MAX_PER_DAY;
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
    var busy = state.loading;
    var h = '<div style="font-family:\'Archivo\',sans-serif;font-weight:700;font-size:15px;color:#241C1F;margin-bottom:16px;">3&nbsp;&nbsp;Your details</div><div style="display:grid;gap:12px;">' +
      '<input id="bk-name"    type="text"  placeholder="Full name"       value="' + esc(f.name)    + '" data-field="name"    style="' + inputStyle() + '">' +
      '<input id="bk-phone"   type="tel"   placeholder="Phone number"    value="' + esc(f.phone)   + '" data-field="phone"   style="' + inputStyle() + '">' +
      '<input id="bk-email"   type="email" placeholder="Email address"   value="' + esc(f.email)   + '" data-field="email"   style="' + inputStyle() + '">' +
      '<div><textarea id="bk-problem" data-field="problem" placeholder="Briefly describe your problem" maxlength="80" rows="2" style="' + inputStyle() + 'resize:none;">' + esc(f.problem) + '</textarea>' +
      '<div id="bk-count" style="font-size:12px;color:' + (len >= 75 ? '#B0303E' : '#A89498') + ';text-align:right;margin-top:3px;">' + len + '/80</div></div></div>';
    if (state.error) h += '<div style="margin-top:14px;font-size:13.5px;color:#B0303E;background:#FBEDEE;border:1px solid #F2D5D8;padding:10px 14px;border-radius:6px;">' + esc(state.error) + '</div>';
    h += '<button type="button" data-act="submit"' + (busy ? ' disabled' : '') + ' style="margin-top:20px;width:100%;font-family:\'Archivo\',sans-serif;font-weight:600;font-size:16px;color:#fff;background:' + (busy ? '#B8909A' : '#7A1F2B') + ';border:none;padding:15px;border-radius:6px;box-shadow:0 4px 14px rgba(122,31,43,.25);cursor:' + (busy ? 'default' : 'pointer') + ';">' + (busy ? 'Booking\u2026' : 'Confirm booking') + '</button>';
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
    var busy = state.loading;
    return '<div style="background:#F5EDE6;border:1px solid #DFD0C8;border-radius:8px;padding:18px;">' +
      '<div style="font-family:\'Archivo\',sans-serif;font-weight:700;font-size:14px;color:#241C1F;margin-bottom:4px;">Find your appointment</div>' +
      '<div style="font-size:12.5px;color:#8C858A;margin-bottom:12px;line-height:1.45;">Enter the name and email you booked with.</div>' +
      '<div style="display:flex;flex-direction:column;gap:9px;margin-bottom:12px;">' +
      '<input id="cn-name"  type="text"  placeholder="Full name"     value="' + esc(state.cancelName)  + '" data-cfield="cancelName"  style="' + inputStyle() + '">' +
      '<input id="cn-email" type="email" placeholder="Email address" value="' + esc(state.cancelEmail) + '" data-cfield="cancelEmail" style="' + inputStyle() + '"></div>' +
      '<div style="display:flex;gap:10px;">' +
      '<button type="button" data-act="find"' + (!ok || busy ? ' disabled' : '') + ' style="' + btnPrimary(!ok || busy) + '">' + (busy ? 'Searching\u2026' : 'Find my appointments') + '</button>' +
      '<button type="button" data-act="close-cancel" style="' + btnGhost() + '">Never mind</button>' +
      '</div></div>';
  }

  function cancelListHTML() {
    var h = '<div style="background:#F5EDE6;border:1px solid #DFD0C8;border-radius:8px;padding:18px;">';
    if (!state.cancelResults.length) {
      h += '<div style="font-size:13.5px;color:#6E6669;line-height:1.5;margin-bottom:12px;">No upcoming appointments found for <strong>' + esc(state.cancelName) + '</strong>.</div>' +
        '<div style="display:flex;gap:10px;justify-content:center;">' +
        '<button type="button" data-act="retry"        style="font-family:\'Archivo\',sans-serif;font-weight:600;font-size:14px;color:#7A1F2B;background:transparent;border:1.5px solid #D4C9C2;padding:10px 18px;border-radius:6px;cursor:pointer;">Try again</button>' +
        '<button type="button" data-act="close-cancel" style="' + btnGhost() + '">Never mind</button></div>';
    } else {
      var busy = state.loading;
      h += '<div style="font-family:\'Archivo\',sans-serif;font-weight:700;font-size:14px;color:#241C1F;margin-bottom:10px;">Which appointment would you like to cancel?</div><div style="display:flex;flex-direction:column;gap:7px;margin-bottom:12px;">';
      state.cancelResults.forEach(function (r) {
        var sel = state.cancelKey === r.id;
        var label = longDate(r.date) + ' at ' + to12h(r.slot);
        h += '<button type="button" data-act="pick" data-key="' + esc(r.id) + '" style="font-family:\'Archivo\',sans-serif;font-weight:600;font-size:13.5px;padding:10px 14px;border-radius:6px;cursor:pointer;text-align:left;border:' + (sel ? '2px solid #7A1F2B' : '1px solid #DFD0C8') + ';background:' + (sel ? '#FBF1F2' : '#FAF3EF') + ';color:' + (sel ? '#7A1F2B' : '#3A3236') + ';">' + label + '</button>';
      });
      var can = !!state.cancelKey && !busy;
      h += '</div><div style="display:flex;gap:10px;">' +
        '<button type="button" data-act="do-cancel"' + (!can ? ' disabled' : '') + ' style="' + btnPrimary(!can) + '">' + (busy ? 'Cancelling\u2026' : 'Cancel this appointment') + '</button>' +
        '<button type="button" data-act="close-cancel" style="' + btnGhost() + '">Never mind</button></div>';
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
    var end   = act && act.selectionEnd   != null ? act.selectionEnd   : null;
    appEl.innerHTML = buildHTML();
    if (id) {
      var el = document.getElementById(id);
      if (el) { el.focus(); if (start != null && el.setSelectionRange) { try { el.setSelectionRange(start, end); } catch (e) {} } }
    }
  }

  /* ---- async operations ---- */
  async function init() {
    try {
      var bk = await fetchAvailability();
      setState({ initialized: true, bookings: bk });
    } catch (e) {
      setState({ initialized: true, error: 'Could not load availability. Please refresh the page.' });
    }
  }

  async function submit() {
    var f = state.form;
    if (!state.selectedTime)                                    return setState({ error: 'Please choose a time slot.' });
    if (!f.name.trim())                                         return setState({ error: 'Please enter your name.' });
    if (f.phone.replace(/\D/g, '').length < 7)                 return setState({ error: 'Please enter a valid phone number.' });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email))         return setState({ error: 'Please enter a valid email address.' });

    setState({ loading: true, error: '' });
    try {
      var resp = await sbPost('bookings', {
        date:    state.selectedDate,
        slot:    state.selectedTime,
        name:    f.name.trim(),
        email:   f.email.trim().toLowerCase(),
        phone:   f.phone.trim(),
        problem: f.problem.trim()
      });

      if (!resp.ok) {
        var body = await resp.json().catch(function () { return {}; });
        if (body.code === '23505' || (body.message && /unique/i.test(body.message))) {
          var refreshed = await fetchAvailability().catch(function () { return state.bookings; });
          setState({ bookings: refreshed, loading: false, error: 'That slot was just taken \u2014 please pick another.' });
          return;
        }
        throw new Error('save');
      }

      var next = Object.assign({}, state.bookings);
      next[state.selectedDate] = (next[state.selectedDate] || []).concat([{ time: state.selectedTime }]);
      setState({
        bookings: next,
        loading: false,
        phase: 'confirmed',
        confirmation: { name: f.name.trim(), date: longDate(state.selectedDate), time: to12h(state.selectedTime) },
        selectedDate: null, selectedTime: null,
        form: { name: '', phone: '', email: '', problem: '' },
        error: ''
      });
    } catch (e) {
      setState({ loading: false, error: 'Could not save your booking. Please try again or call us at 585-271-0050.' });
    }
  }

  async function findAppointments() {
    setState({ loading: true, error: '' });
    try {
      var today = isoOf(new Date());
      var n  = encodeURIComponent(state.cancelName.trim());
      var em = encodeURIComponent(state.cancelEmail.trim().toLowerCase());
      var resp = await sbGet('bookings?select=id,date,slot&name=ilike.' + n + '&email=ilike.' + em + '&date=gte.' + today + '&order=date,slot');
      if (!resp.ok) throw new Error('search');
      var rows = await resp.json();
      setState({ loading: false, cancelSearched: true, cancelResults: rows });
    } catch (e) {
      setState({ loading: false, error: 'Could not search. Please try again.' });
    }
  }

  async function doCancel() {
    if (!state.cancelKey) return;
    setState({ loading: true, error: '' });
    try {
      var resp = await sbDelete('bookings?id=eq.' + encodeURIComponent(state.cancelKey));
      if (!resp.ok) throw new Error('cancel');
      setState({
        loading: false,
        phase: 'cancel-done',
        cancelOpen: false, cancelSearched: false,
        cancelName: '', cancelEmail: '',
        cancelResults: [], cancelKey: null
      });
    } catch (e) {
      setState({ loading: false, error: 'Could not cancel. Please call us at 585-271-0050.' });
    }
  }

  /* ---- events ---- */
  function onClick(e) {
    var btn = e.target.closest('[data-act]');
    if (!btn || btn.disabled) return;
    var a = btn.getAttribute('data-act');
    if      (a === 'day')         setState({ selectedDate: btn.getAttribute('data-iso'), selectedTime: null, error: '' });
    else if (a === 'time')        setState({ selectedTime: btn.getAttribute('data-time'), error: '' });
    else if (a === 'submit')      submit();
    else if (a === 'find')        findAppointments();
    else if (a === 'do-cancel')   doCancel();
    else if (a === 'book-another') setState({ phase: 'book', confirmation: null, selectedDate: null, selectedTime: null, form: { name: '', phone: '', email: '', problem: '' }, error: '' });
    else if (a === 'reset')       setState({ phase: 'book', selectedDate: null, selectedTime: null, cancelOpen: false, cancelSearched: false, cancelName: '', cancelEmail: '', cancelResults: [], cancelKey: null });
    else if (a === 'open-cancel') setState({ cancelOpen: true });
    else if (a === 'close-cancel') setState({ cancelOpen: false, cancelSearched: false, cancelName: '', cancelEmail: '', cancelResults: [], cancelKey: null });
    else if (a === 'retry')       setState({ cancelSearched: false, cancelKey: null, cancelResults: [] });
    else if (a === 'pick')        setState({ cancelKey: btn.getAttribute('data-key') });
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

  function scheduleMidnight() {
    var now = new Date(), m = new Date(now); m.setHours(24, 0, 0, 0);
    setTimeout(function () {
      if (state.selectedDate && new Date(state.selectedDate + 'T00:00:00') < new Date()) {
        state.selectedDate = null; state.selectedTime = null;
      }
      fetchAvailability().then(function (bk) { setState({ bookings: bk }); }).catch(function () {}).finally(scheduleMidnight);
    }, m - now);
  }

  document.addEventListener('DOMContentLoaded', function () {
    appEl = document.getElementById('booking-app');
    if (!appEl) return;
    appEl.addEventListener('click', onClick);
    appEl.addEventListener('input', onInput);
    render();
    init();
    scheduleMidnight();
  });
})();
