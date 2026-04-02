/**
 * Chronic Disease Self-Management Dashboard
 * Vanilla JS + localStorage + Chart.js
 */

(function () {
  'use strict';

  /** @constant Key used in localStorage for the entries array */
  const STORAGE_KEY = 'cdsmEntries';

  /** Thresholds aligned with alert rules */
  const HIGH_SUGAR = 180;
  const HIGH_SYSTOLIC = 140;
  const HIGH_DIASTOLIC = 90;
  const LOW_ACTIVITY = 30;
  const CONSECUTIVE_DAYS = 3;

  /** @type {Chart | null} */
  let chartBloodSugar = null;
  /** @type {Chart | null} */
  let chartBP = null;

  // --- DOM references ---
  const navButtons = document.querySelectorAll('.nav-btn');
  const sections = document.querySelectorAll('.section');

  const dashboardEmpty = document.getElementById('dashboard-empty');
  const dashboardContent = document.getElementById('dashboard-content');
  const latestReadings = document.getElementById('latest-readings');
  const averagesReadings = document.getElementById('averages-readings');
  const trendTable = document.getElementById('trend-table');

  const alertsEmpty = document.getElementById('alerts-empty');
  const alertsContent = document.getElementById('alerts-content');
  const alertList = document.getElementById('alert-list');

  const insightsEmpty = document.getElementById('insights-empty');
  const insightsContent = document.getElementById('insights-content');
  const insightList = document.getElementById('insight-list');

  const chartsEmpty = document.getElementById('charts-empty');
  const chartsContent = document.getElementById('charts-content');

  const entryForm = document.getElementById('entry-form');
  const formFeedback = document.getElementById('form-feedback');

  const printReportArea = document.getElementById('print-report-area');
  const btnGenerateReport = document.getElementById('btn-generate-report');
  const btnNavReport = document.getElementById('btn-nav-report');
  const reportTable = document.getElementById('report-table');
  const reportSummary = document.getElementById('report-summary');
  const reportAlerts = document.getElementById('report-alerts');
  const printGeneratedAt = document.getElementById('print-generated-at');
  const printHypertensionStatus = document.getElementById('print-hypertension-status');

  // --- Storage ---

  /**
   * Load parsed entries from localStorage (always an array).
   * @returns {Array<Object>}
   */
  function loadEntries() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      const arr = Array.isArray(parsed) ? parsed : [];
      return arr.map(normalizeEntry);
    } catch {
      return [];
    }
  }

  /**
   * Persist the full entries array.
   * @param {Array<Object>} entries
   */
  function saveEntries(entries) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }

  /**
   * Normalize older data shapes into the current schema.
   * @param {any} entry
   * @returns {Object}
   */
  function normalizeEntry(entry) {
    const e = entry && typeof entry === 'object' ? entry : {};

    const createdAt = Number.isFinite(Number(e.createdAt)) ? Number(e.createdAt) : 0;

    const date = String(e.date || '').slice(0, 10) || '';
    const bloodSugar = Number(e.bloodSugar);
    const systolicBP = Number(e.systolicBP);
    const diastolicBP = Number(e.diastolicBP);
    const weight = e.weight == null || e.weight === '' ? null : Number(e.weight);

    // Meals (new) vs old single `meals` string.
    const breakfast = typeof e.breakfast === 'string' ? e.breakfast : (typeof e.meals === 'string' ? e.meals : '');
    const lunch = typeof e.lunch === 'string' ? e.lunch : '';
    const dinner = typeof e.dinner === 'string' ? e.dinner : '';

    // Medication (new) vs old `medicationTaken`.
    const morningMedicineTaken =
      typeof e.morningMedicineTaken === 'boolean'
        ? e.morningMedicineTaken
        : typeof e.medicationTaken === 'boolean'
          ? e.medicationTaken
          : true;
    const nightMedicineTaken =
      typeof e.nightMedicineTaken === 'boolean'
        ? e.nightMedicineTaken
        : typeof e.medicationTaken === 'boolean'
          ? e.medicationTaken
          : true;
    const insulinIntake =
      typeof e.insulinIntake === 'boolean' ? e.insulinIntake : false;

    const activityMinutes =
      e.activityMinutes == null || e.activityMinutes === '' ? 0 : Number(e.activityMinutes);
    const activityType =
      typeof e.activityType === 'string' && e.activityType.trim() ? e.activityType : 'Logged activity';

    return {
      date,
      bloodSugar,
      systolicBP,
      diastolicBP,
      weight,
      breakfast,
      lunch,
      dinner,
      morningMedicineTaken,
      nightMedicineTaken,
      insulinIntake,
      activityMinutes,
      activityType,
      createdAt,
    };
  }

  /**
   * Sort by date string (YYYY-MM-DD) descending (newest first).
   * @param {Array<Object>} entries
   * @returns {Array<Object>}
   */
  function sortByDateDesc(entries) {
    return [...entries].sort((a, b) => {
      const dateCmp = String(b.date).localeCompare(String(a.date));
      if (dateCmp !== 0) return dateCmp;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
  }

  /**
   * Sort ascending for charts and consecutive-day logic.
   * @param {Array<Object>} entries
   * @returns {Array<Object>}
   */
  function sortByDateAsc(entries) {
    return [...entries].sort((a, b) => {
      const dateCmp = String(a.date).localeCompare(String(b.date));
      if (dateCmp !== 0) return dateCmp;
      return (a.createdAt || 0) - (b.createdAt || 0);
    });
  }

  // --- Validation ---
  let dateMinISO = '';
  let dateMaxISO = '';

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function formatISODateLocal(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function setupDateRange() {
    const today = new Date();
    const maxD = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const minD = new Date(maxD);
    minD.setDate(minD.getDate() - 6);

    dateMaxISO = formatISODateLocal(maxD);
    dateMinISO = formatISODateLocal(minD);

    const fieldDate = document.getElementById('field-date');
    fieldDate.min = dateMinISO;
    fieldDate.max = dateMaxISO;

    if (!fieldDate.value) {
      fieldDate.value = dateMaxISO;
    }
  }

  function clearFieldErrors() {
    const ids = [
      'date',
      'bloodSugar',
      'systolicBP',
      'diastolicBP',
      'breakfast',
      'lunch',
      'dinner',
      'activityMinutes',
      'activityType',
      'weight',
    ];

    ids.forEach((key) => {
      const el = document.getElementById('error-' + key);
      if (el) el.textContent = '';
    });
  }

  /**
   * Validate form; set inline errors. Returns null if invalid.
   * @returns {Object | null}
   */
  function readAndValidateForm() {
    clearFieldErrors();
    let valid = true;

    const dateStr = document.getElementById('field-date').value.trim();
    if (!dateStr) {
      document.getElementById('error-date').textContent = 'Date is required.';
      valid = false;
    } else if (dateStr > dateMaxISO || dateStr < dateMinISO) {
      document.getElementById('error-date').textContent =
        'Date must be within the last 7 days and not in the future.';
      valid = false;
    }

    const bsRaw = document.getElementById('field-blood-sugar').value.trim();
    const bloodSugar = bsRaw === '' ? NaN : Number(bsRaw);
    if (bsRaw === '' || !Number.isFinite(bloodSugar) || bloodSugar <= 0) {
      document.getElementById('error-bloodSugar').textContent =
        'Enter a valid blood sugar (mg/dL).';
      valid = false;
    }

    const sysRaw = document.getElementById('field-systolic').value.trim();
    const diaRaw = document.getElementById('field-diastolic').value.trim();
    const systolicBP = sysRaw === '' ? NaN : Number(sysRaw);
    const diastolicBP = diaRaw === '' ? NaN : Number(diaRaw);

    if (sysRaw === '' || !Number.isFinite(systolicBP) || systolicBP <= 0) {
      document.getElementById('error-systolicBP').textContent = 'Systolic BP is required.';
      valid = false;
    }
    if (diaRaw === '' || !Number.isFinite(diastolicBP) || diastolicBP <= 0) {
      document.getElementById('error-diastolicBP').textContent = 'Diastolic BP is required.';
      valid = false;
    }

    const breakfast = document.getElementById('field-breakfast').value.trim();
    const lunch = document.getElementById('field-lunch').value.trim();
    const dinner = document.getElementById('field-dinner').value.trim();

    if (!breakfast) {
      document.getElementById('error-breakfast').textContent = 'Breakfast is required.';
      valid = false;
    }
    if (!lunch) {
      document.getElementById('error-lunch').textContent = 'Lunch is required.';
      valid = false;
    }
    if (!dinner) {
      document.getElementById('error-dinner').textContent = 'Dinner is required.';
      valid = false;
    }

    const activityMinutesRaw = document.getElementById('field-activityMinutes').value.trim();
    const activityMinutes =
      activityMinutesRaw === '' ? NaN : Number(activityMinutesRaw);
    const activityType = document.getElementById('field-activityType').value.trim();

    if (
      activityMinutesRaw === '' ||
      !Number.isFinite(activityMinutes) ||
      activityMinutes < 0
    ) {
      document.getElementById('error-activityMinutes').textContent =
        'Enter activity minutes (0 or more).';
      valid = false;
    }
    if (!activityType) {
      document.getElementById('error-activityType').textContent = 'Activity type is required.';
      valid = false;
    }

    const weightRaw = document.getElementById('field-weight').value.trim();
    let weight = null;
    if (weightRaw !== '') {
      const w = Number(weightRaw);
      if (!Number.isFinite(w) || w < 0) {
        document.getElementById('error-weight').textContent =
          'Enter a valid weight or leave blank.';
        document.getElementById('field-weight').focus();
        valid = false;
      } else {
        weight = w;
      }
    }

    // Booleans come from checkboxes and are never "empty".
    const morningMedicineTaken = document.getElementById('field-morning-medicine').checked;
    const nightMedicineTaken = document.getElementById('field-night-medicine').checked;
    const insulinIntake = document.getElementById('field-insulin').checked;

    if (!valid) return null;

    return {
      date: dateStr,
      bloodSugar,
      systolicBP,
      diastolicBP,
      weight,
      breakfast,
      lunch,
      dinner,
      morningMedicineTaken,
      nightMedicineTaken,
      insulinIntake,
      activityMinutes,
      activityType,
      createdAt: Date.now(),
    };
  }

  // --- Stats & patterns ---

  function average(nums) {
    const clean = nums.filter((n) => Number.isFinite(n));
    if (!clean.length) return null;
    const sum = clean.reduce((a, b) => a + b, 0);
    return Math.round((sum / clean.length) * 10) / 10;
  }

  /**
   * @param {string} isoDate YYYY-MM-DD
   * @returns {string} next calendar day
   */
  function addOneDay(isoDate) {
    const d = new Date(isoDate + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /**
   * Max blood sugar per calendar day (for consecutive high pattern).
   * @param {Array<Object>} entries
   * @returns {Map<string, number>}
   */
  function maxBloodSugarByDate(entries) {
    const m = new Map();
    entries.forEach((e) => {
      const cur = m.get(e.date);
      if (cur == null || e.bloodSugar > cur) m.set(e.date, e.bloodSugar);
    });
    return m;
  }

  /**
   * Min activity per calendar day (if multiple entries, flag low if any day min < 30).
   * @param {Array<Object>} entries
   */
  function minActivityByDate(entries) {
    const m = new Map();
    entries.forEach((e) => {
      const cur = m.get(e.date);
      if (cur == null || e.activityMinutes < cur) m.set(e.date, e.activityMinutes);
    });
    return m;
  }

  /**
   * True if there exist CONSECUTIVE_DAYS consecutive calendar days with predicate.
   * @param {string[]} sortedDatesAsc unique sorted YYYY-MM-DD
   * @param {(date: string) => boolean} dayPredicate
   */
  function hasConsecutiveStreak(sortedDatesAsc, dayPredicate) {
    if (sortedDatesAsc.length < CONSECUTIVE_DAYS) return false;
    let run = 0;
    for (let i = 0; i < sortedDatesAsc.length; i++) {
      const d = sortedDatesAsc[i];
      if (!dayPredicate(d)) {
        run = 0;
        continue;
      }
      if (run === 0) {
        run = 1;
        continue;
      }
      const prev = sortedDatesAsc[i - 1];
      if (addOneDay(prev) === d) {
        run++;
        if (run >= CONSECUTIVE_DAYS) return true;
      } else {
        run = 1;
      }
    }
    return false;
  }

  /**
   * Build alert messages from the most recent entry (rule-based).
   * @param {Object | undefined} latest
   * @returns {Array<{ type: string, text: string }>}
   */
  function buildAlertsFromLatest(latest) {
    const items = [];
    if (!latest) return items;

    if (latest.bloodSugar > HIGH_SUGAR) {
      items.push({ type: 'warn', text: 'High blood sugar' });
    }
    if (latest.systolicBP > HIGH_SYSTOLIC || latest.diastolicBP > HIGH_DIASTOLIC) {
      items.push({ type: 'warn', text: 'High BP' });
    }
    if (!latest.morningMedicineTaken) {
      items.push({ type: 'remind', text: 'Reminder: Morning medicine not taken' });
    }
    if (!latest.nightMedicineTaken) {
      items.push({ type: 'remind', text: 'Reminder: Night medicine not taken' });
    }

    if (items.length === 0) {
      items.push({ type: 'ok', text: 'No alerts' });
    }
    return items;
  }

  /**
   * Pattern-based insights (consecutive days).
   * @param {Array<Object>} entries
   * @returns {string[]}
   */
  function buildInsightSuggestions(entries) {
    const suggestions = [];
    if (!entries.length) return suggestions;

    const datesAsc = [...new Set(sortByDateAsc(entries).map((e) => e.date))].sort();
    const maxSugar = maxBloodSugarByDate(entries);
    const minAct = minActivityByDate(entries);

    const highSugarDay = (d) => (maxSugar.get(d) ?? 0) > HIGH_SUGAR;
    const lowActivityDay = (d) => (minAct.get(d) ?? 0) < LOW_ACTIVITY;

    if (hasConsecutiveStreak(datesAsc, highSugarDay)) {
      suggestions.push('High blood sugar for 3 consecutive days. Consider reviewing meals and glucose management.');
    }
    if (hasConsecutiveStreak(datesAsc, lowActivityDay)) {
      suggestions.push('Consider increasing physical activity — activity is under 30 minutes for 3 consecutive days.');
    }

    if (!suggestions.length) {
      suggestions.push('No strong multi-day patterns detected. Keep logging consistently.');
    }
    return suggestions;
  }

  // --- Rendering ---

  function setSection(id) {
    sections.forEach((s) => {
      s.classList.toggle('section--active', s.id === 'section-' + id);
    });
    navButtons.forEach((b) => {
      b.classList.toggle('active', b.dataset.section === id);
    });
  }

  function renderLatest(dl, latest) {
    dl.innerHTML = '';
    if (!latest) return;

    const sugarHigh = latest.bloodSugar > HIGH_SUGAR;
    const bpHigh =
      latest.systolicBP > HIGH_SYSTOLIC || latest.diastolicBP > HIGH_DIASTOLIC;

    function addRow(label, valueHtml, statusClass) {
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.innerHTML = valueHtml;
      if (statusClass) dd.classList.add(statusClass);
      dl.appendChild(dt);
      dl.appendChild(dd);
    }

    addRow('Date', escapeHtml(latest.date));
    addRow(
      'Blood sugar',
      `${latest.bloodSugar} mg/dL`,
      sugarHigh ? 'status-warn' : 'status-ok'
    );
    addRow(
      'Blood pressure',
      `${latest.systolicBP} / ${latest.diastolicBP} mmHg`,
      bpHigh ? 'status-warn' : 'status-ok'
    );
    addRow('Weight', latest.weight != null ? String(latest.weight) : '—');

    addRow('Breakfast', escapeHtml(latest.breakfast || '—'));
    addRow('Lunch', escapeHtml(latest.lunch || '—'));
    addRow('Dinner', escapeHtml(latest.dinner || '—'));

    addRow(
      'Morning medicine',
      latest.morningMedicineTaken ? 'Taken' : 'Missed',
      latest.morningMedicineTaken ? 'status-ok' : 'status-warn'
    );
    addRow(
      'Night medicine',
      latest.nightMedicineTaken ? 'Taken' : 'Missed',
      latest.nightMedicineTaken ? 'status-ok' : 'status-warn'
    );
    addRow(
      'Insulin intake',
      latest.insulinIntake ? 'Yes' : 'No',
      latest.insulinIntake ? 'status-ok' : ''
    );

    addRow(
      'Activity',
      `${latest.activityMinutes} min (${escapeHtml(latest.activityType || '—')})`
    );
  }

  function renderAverages(dl, entries) {
    dl.innerHTML = '';
    if (!entries.length) return;

    const avgSugar = average(entries.map((e) => e.bloodSugar));
    const avgSys = average(entries.map((e) => e.systolicBP));
    const avgDia = average(entries.map((e) => e.diastolicBP));

    function addRow(label, text) {
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = text;
      dl.appendChild(dt);
      dl.appendChild(dd);
    }

    addRow('Avg blood sugar', avgSugar != null ? `${avgSugar} mg/dL` : '—');
    addRow('Avg systolic BP', avgSys != null ? `${avgSys} mmHg` : '—');
    addRow('Avg diastolic BP', avgDia != null ? `${avgDia} mmHg` : '—');
  }

  function renderTrendTable(table, lastSeven) {
    table.innerHTML = '';
    if (!lastSeven.length) return;

    const thead = document.createElement('thead');
    thead.innerHTML =
      '<tr><th>Date</th><th>BS (mg/dL)</th><th>BP</th><th>Activity</th><th>Meals</th><th>Meds</th></tr>';
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    lastSeven.forEach((e) => {
      const tr = document.createElement('tr');
      const mealsText = `B: ${e.breakfast || '—'} | L: ${e.lunch || '—'} | D: ${e.dinner || '—'}`;
      const medsText = `Morning: ${e.morningMedicineTaken ? 'Yes' : 'No'}; Night: ${
        e.nightMedicineTaken ? 'Yes' : 'No'
      }; Insulin: ${e.insulinIntake ? 'Yes' : 'No'}`;
      tr.innerHTML = `
        <td>${escapeHtml(e.date)}</td>
        <td>${e.bloodSugar}</td>
        <td>${e.systolicBP}/${e.diastolicBP}</td>
        <td>${e.activityMinutes}m<br/>${escapeHtml(e.activityType || '—')}</td>
        <td>${escapeHtml(mealsText)}</td>
        <td>${escapeHtml(medsText)}</td>
      `;
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  /**
   * Destroy existing Chart instance if present.
   * @param {Chart | null} chart
   * @returns {null}
   */
  function destroyChart(chart) {
    if (chart) {
      chart.destroy();
    }
    return null;
  }

  /**
   * Build or refresh line charts for last 7 entries (chronological on X axis).
   * @param {Array<Object>} lastSevenChrono oldest → newest
   */
  function updateCharts(lastSevenChrono) {
    const labels = lastSevenChrono.map((e) => e.date);
    const sugars = lastSevenChrono.map((e) => e.bloodSugar);
    const sys = lastSevenChrono.map((e) => e.systolicBP);

    const ctxSugar = document.getElementById('chart-blood-sugar');
    const ctxBpSys = document.getElementById('chart-bp-sys');
    if (!ctxSugar || !ctxBpSys || typeof Chart === 'undefined') return;

    chartBloodSugar = destroyChart(chartBloodSugar);
    chartBP = destroyChart(chartBP);

    const commonOptions = {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: false },
      },
    };

    chartBloodSugar = new Chart(ctxSugar, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Blood sugar (mg/dL)',
            data: sugars,
            borderColor: '#2d6a4f',
            backgroundColor: 'rgba(45, 106, 79, 0.15)',
            tension: 0.25,
            fill: true,
          },
        ],
      },
      options: commonOptions,
    });

    chartBP = new Chart(ctxBpSys, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Systolic BP',
            data: sys,
            borderColor: '#1b4332',
            tension: 0.25,
          },
        ],
      },
      options: commonOptions,
    });
  }

  function renderAlertsAndInsights(entries) {
    const sorted = sortByDateDesc(entries);
    const latest = sorted[0];

    const alerts = buildAlertsFromLatest(latest);
    alertList.innerHTML = '';
    alerts.forEach((a) => {
      const li = document.createElement('li');
      li.textContent = a.text;
      if (a.type === 'warn') li.classList.add('alert-warn');
      else if (a.type === 'ok') li.classList.add('alert-ok');
      else li.classList.add('alert-remind');
      alertList.appendChild(li);
    });

    const insights = buildInsightSuggestions(entries);
    insightList.innerHTML = '';
    insights.forEach((text) => {
      const li = document.createElement('li');
      li.textContent = text;
      insightList.appendChild(li);
    });
  }

  /**
   * Full UI refresh from storage.
   */
  function refreshAll() {
    const entries = loadEntries();
    const hasData = entries.length > 0;

    dashboardEmpty.hidden = hasData;
    dashboardContent.hidden = !hasData;
    alertsEmpty.hidden = hasData;
    alertsContent.hidden = !hasData;
    insightsEmpty.hidden = hasData;
    insightsContent.hidden = !hasData;
    chartsEmpty.hidden = hasData;
    chartsContent.hidden = !hasData;

    if (!hasData) {
      latestReadings.innerHTML = '';
      averagesReadings.innerHTML = '';
      trendTable.innerHTML = '';
      alertList.innerHTML = '';
      insightList.innerHTML = '';
      chartsContent.hidden = true;
      chartsEmpty.hidden = false;
      chartBloodSugar = destroyChart(chartBloodSugar);
      chartBP = destroyChart(chartBP);
      return;
    }

    const desc = sortByDateDesc(entries);
    const latest = desc[0];
    const lastSeven = desc.slice(0, 7);
    const lastSevenChrono = [...lastSeven].reverse();

    renderLatest(latestReadings, latest);
    renderAverages(averagesReadings, entries);
    renderTrendTable(trendTable, lastSeven);
    renderAlertsAndInsights(entries);

    const chartsSection = document.getElementById('section-charts');
    const chartsIsActive = chartsSection && chartsSection.classList.contains('section--active');
    if (chartsIsActive) {
      updateCharts(lastSevenChrono);
    } else {
      // Avoid initializing charts while hidden (can produce incorrect sizing).
      chartBloodSugar = destroyChart(chartBloodSugar);
      chartBP = destroyChart(chartBP);
    }
  }

  /**
   * Fill printable report DOM (last 7, summary, alerts).
   */
  function fillReportDOM() {
    const entries = loadEntries();
    const desc = sortByDateDesc(entries);
    const lastSeven = desc.slice(0, 7);
    const latest = desc[0];

    printGeneratedAt.textContent =
      'Generated: ' + new Date().toLocaleString();

    if (!entries.length) {
      reportTable.innerHTML =
        '<tr><td colspan="7">No data available</td></tr>';
      reportSummary.innerHTML = '<li>No data available</li>';
      reportAlerts.innerHTML = '<li>No alerts</li>';
      if (printHypertensionStatus) printHypertensionStatus.textContent = 'Unknown';
      return;
    }

    // Hypertension status based on latest entry BP.
    const isHighBP = latest.systolicBP > HIGH_SYSTOLIC || latest.diastolicBP > HIGH_DIASTOLIC;
    if (printHypertensionStatus) {
      printHypertensionStatus.innerHTML = `
        <span class="badge ${isHighBP ? 'badge--warn' : 'badge--ok'}">${isHighBP ? 'High' : 'Normal'} BP</span>
      `;
    }

    // Table of last 7 entries.
    const thead = document.createElement('thead');
    thead.innerHTML =
      '<tr><th>Date</th><th>Blood sugar</th><th>BP</th><th>Meals</th><th>Meds</th><th>Activity</th><th>Weight</th></tr>';
    const tbody = document.createElement('tbody');

    lastSeven.forEach((e) => {
      const tr = document.createElement('tr');
      const mealsText = `B: ${e.breakfast || '—'} / L: ${e.lunch || '—'} / D: ${e.dinner || '—'}`;
      const medsText = `AM: ${e.morningMedicineTaken ? 'Yes' : 'No'}; PM: ${
        e.nightMedicineTaken ? 'Yes' : 'No'
      }; Ins: ${e.insulinIntake ? 'Yes' : 'No'}`;
      const activityText = `${e.activityMinutes} min (${e.activityType || '—'})`;

      tr.innerHTML = `
        <td>${escapeHtml(e.date)}</td>
        <td>${e.bloodSugar} mg/dL</td>
        <td>${e.systolicBP}/${e.diastolicBP}</td>
        <td>${escapeHtml(mealsText)}</td>
        <td>${escapeHtml(medsText)}</td>
        <td>${escapeHtml(activityText)}</td>
        <td>${e.weight != null ? e.weight : '—'}</td>
      `;
      tbody.appendChild(tr);
    });

    reportTable.innerHTML = '';
    reportTable.appendChild(thead);
    reportTable.appendChild(tbody);

    // Summary statistics.
    const avgSugar = average(entries.map((e) => e.bloodSugar));
    const avgSys = average(entries.map((e) => e.systolicBP));
    const avgDia = average(entries.map((e) => e.diastolicBP));
    const avgActivity = average(entries.map((e) => Number(e.activityMinutes) || 0));

    reportSummary.innerHTML = '';
    const summaryItems = [
      `Total entries: ${entries.length}`,
      `Average blood sugar: ${avgSugar != null ? avgSugar : '—'} mg/dL`,
      `Average BP: ${avgSys != null ? avgSys : '—'}/${avgDia != null ? avgDia : '—'} mmHg`,
      `Average activity: ${avgActivity != null ? avgActivity : '—'} min`,
      `Hypertension status: ${isHighBP ? 'High' : 'Normal'}`,
    ];
    summaryItems.forEach((t) => {
      const li = document.createElement('li');
      li.textContent = t;
      reportSummary.appendChild(li);
    });

    // Alerts.
    reportAlerts.innerHTML = '';
    const alerts = buildAlertsFromLatest(latest);
    if (!alerts.length) {
      const li = document.createElement('li');
      li.textContent = 'No alerts';
      reportAlerts.appendChild(li);
    } else {
      alerts.forEach((a) => {
        const li = document.createElement('li');
        li.textContent = a.text;
        if (a.type === 'warn') li.classList.add('alert-warn');
        else if (a.type === 'ok') li.classList.add('alert-ok');
        else li.classList.add('alert-remind');
        reportAlerts.appendChild(li);
      });
    }
  }

  // --- Events ---

  navButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.section;
      if (!id) return;

      setSection(id);

      if (id === 'charts') {
        const entries = loadEntries();
        const hasData = entries.length > 0;
        if (!hasData) {
          chartBloodSugar = destroyChart(chartBloodSugar);
          chartBP = destroyChart(chartBP);
          return;
        }
        const desc = sortByDateDesc(entries);
        const lastSeven = desc.slice(0, 7);
        const lastSevenChrono = [...lastSeven].reverse();
        updateCharts(lastSevenChrono);
      }
    });
  });

  entryForm.addEventListener('submit', (e) => {
    e.preventDefault();
    formFeedback.textContent = '';
    formFeedback.classList.remove('is-error');

    const data = readAndValidateForm();
    if (!data) {
      formFeedback.textContent = 'Please fix the errors above.';
      formFeedback.classList.add('is-error');
      return;
    }

    const entries = loadEntries();
    entries.push(data);
    saveEntries(entries);

    formFeedback.textContent = 'Entry saved successfully.';
    entryForm.reset();
    // Reset defaults for the next entry.
    document.getElementById('field-morning-medicine').checked = true;
    document.getElementById('field-night-medicine').checked = true;
    document.getElementById('field-insulin').checked = false;
    document.getElementById('field-date').value = dateMaxISO;

    refreshAll();
    setSection('dashboard');
  });

  btnGenerateReport.addEventListener('click', () => {
    fillReportDOM();
    printReportArea.hidden = false;
    setSection('report');
    requestAnimationFrame(() => {
      window.print();
    });
  });

  // Init: date constraints and first render.
  setupDateRange();
  document.getElementById('field-date').value = dateMaxISO;
  refreshAll();
})();
