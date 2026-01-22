// File: WorkdayScheduleRunner.tm.js
// ==UserScript==
// @name         Workday Schedule Runner (menu-launch, compact controls)
// @namespace    local
// @version      1.4.2
// @description  Parse SHIFTS text, run Workday updates. Transparent modal for visible background during processing. Detects employees with leave events and reports them in the status box after all actions complete.
// @match        https://*.myworkday.com/*
// @run-at       document-idle
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @updateURL    https://raw.githubusercontent.com/G-Ri-F-87/my-tools/main/tampermonkey/WorkdayScheduleRunner.tm.js
// @downloadURL  https://raw.githubusercontent.com/G-Ri-F-87/my-tools/main/tampermonkey/WorkdayScheduleRunner.tm.js
// ==/UserScript==

(function () {
  'use strict';

  const NICK_DISPLAY = {
    "camela.valdez": "Camela Ann Valdez",
    "chester.nepomuceno": "Chester John Nepomuceno",
    "iris.osano": "Iris Messiah Osano - Ulan",
    "jamie.nicanor": "Jamie Nicanor",
    "jay.quiachon": "Jay Francis Quiachon",
    "joanne.orden": "Joanne Princess Orden",
    "joselle.necio": "Joselle Cara Endozo",
    "joven.balbastro": "Joven Balbastro",
    "kristianne.diamat": "Jesse Diamat",
    "mark.lopez": "Mark Eduard Lopez",
    "rina.delarosa": "Rina Dela Rosa",
    "vincent.robin": "Vincent Angelo Robin",
    "jennifer.tio": "Jennifer Tio",
    "jassiel.gallego": "Jassiel Quirante Gallego",
    "kerren.perez": "Kerren Angelique Perez",
  };

  const Z = 2147483647;
  const LIST_SELECTOR = 'div[data-automation-id="calendarNavigationOverlay"]+div ul[data-automation-id="selectedItemList"] div[data-automation-id="menuItem"]';
  const CHART_GROUP_SELECTOR = 'div[data-automation-id="chartOuterContainer"] svg > g:nth-child(2)';
  const POPUP_PANEL_SELECTOR = 'div[data-automation-id="popUpDialog"] div[data-automation-id="panel"]';
  const TOOLBAR_SELECTOR = 'div[data-automation-id="popUpDialog"] div[data-automation-id="toolbarButtonContainer"]';
  const DAY_TO_INDEX = { Tue:0, Wed:1, Thu:2, Fri:3, Sat:4, Sun:5, Mon:6 };

  const employeesWithLeave = new Set();

  GM_registerMenuCommand("Run Workday Schedule", openUI);

  function openUI() {
    if (document.getElementById("sr-modal")) return;
    injectStyles();

    const m = document.createElement("div");
    m.id = "sr-modal";
    m.className = "sr-modal";
    m.innerHTML = `
      <div class="sr-card">
        <h3 style="margin:0 0 8px 0;">Shifts Text → Run</h3>
        <textarea id="sr-input" rows="5" placeholder="Shifts\ncamela.valdez (2): Tue, Wed"></textarea>
        <div class="sr-actions">
          <div>
            <button class="sr-btn" id="sr-run">Run</button>
            <button class="sr-btn" id="sr-close">Close</button>
          </div>
          <div class="sr-controls">
            <button data-pos="tl">↖</button><button data-pos="tc">↑</button><button data-pos="tr">↗</button>
            <button data-pos="cl">←</button><button data-pos="cc">•</button><button data-pos="cr">→</button>
            <button data-pos="bl">↙</button><button data-pos="bc">↓</button><button data-pos="br">↘</button>
          </div>
        </div>
        <div id="sr-status" style="margin-top:8px;color:#0f0;font-weight:bold;white-space:pre-line;"></div>
      </div>
    `;
    document.body.appendChild(m);

    const $ = (sel) => m.querySelector(sel);
    const textarea = $("#sr-input");

    textarea.addEventListener("input", () => {
      textarea.rows = Math.min(15, Math.max(5, textarea.value.split("\n").length));
    });

    $("#sr-close").onclick = () => m.remove();

    m.querySelectorAll(".sr-controls button").forEach(btn => {
      btn.onclick = () => {
        const pos = btn.dataset.pos;
        switch(pos){
          case "tl": m.style.alignItems="flex-start"; m.style.justifyContent="flex-start"; break;
          case "tc": m.style.alignItems="flex-start"; m.style.justifyContent="center"; break;
          case "tr": m.style.alignItems="flex-start"; m.style.justifyContent="flex-end"; break;
          case "cl": m.style.alignItems="center"; m.style.justifyContent="flex-start"; break;
          case "cc": m.style.alignItems="center"; m.style.justifyContent="center"; break;
          case "cr": m.style.alignItems="center"; m.style.justifyContent="flex-end"; break;
          case "bl": m.style.alignItems="flex-end"; m.style.justifyContent="flex-start"; break;
          case "bc": m.style.alignItems="flex-end"; m.style.justifyContent="center"; break;
          case "br": m.style.alignItems="flex-end"; m.style.justifyContent="flex-end"; break;
        }
      };
    });

    $("#sr-run").onclick = async () => {
      const raw = textarea.value || "";
      const actions = parseActions(raw);
      const card = m.querySelector(".sr-card");
      const status = $("#sr-status");

      card.style.opacity = "0.5";
      status.textContent = "";

      let idx = 0;
      for (const a of actions) {
        idx++;
        status.textContent = `Processing: ${NICK_DISPLAY[a.name] || a.name} ${a.day} (${idx} of ${actions.length})`;
        try {
          await processScheduleChange(a);
        } catch (e) {
          console.error("❌ Error for", a, e);
          status.textContent += `\n❌ Failed: ${a.name} ${a.day}`;
        }
      }

      await finalizeReport();

      card.style.opacity = "1.0";
    };
  }

  function injectStyles() {
    if (document.getElementById("sr-style")) return;
    const style = document.createElement("style");
    style.id = "sr-style";
    style.textContent = `
      .sr-modal{position:fixed;inset:0;background:transparent;z-index:${Z};display:flex;align-items:center;justify-content:center}
      .sr-card{background:#111;color:#eee;border:1px solid #333;border-radius:12px;max-width:860px;width:94vw;max-height:90vh;overflow:auto;padding:16px;font-family:system-ui,Segoe UI,Roboto,Arial;transition:opacity .3s ease}
      .sr-card textarea{width:100%;box-sizing:border-box;background:#0c0c0c;color:#eee;border:1px solid #333;border-radius:8px;padding:8px;margin:6px 0;font-family:monospace;min-height:120px}
      .sr-btn{display:inline-flex;gap:8px;align-items:center;padding:8px 12px;margin:0 6px 0 0;border:1px solid #3a3a3a;border-radius:8px;background:#1b1b1b;color:#fff;cursor:pointer}
      .sr-actions{display:flex;align-items:center;justify-content:space-between;margin-top:8px}
      .sr-controls{display:grid;grid-template-columns:repeat(3,1fr);margin-left:auto}
      .sr-controls button{width:12px;height:12px;padding:0;font-size:9px;background:#222;color:#aaa;cursor:pointer;line-height:1;border:none}
      .sr-controls button:hover{background:#333;color:#fff}
    `;
    document.head.appendChild(style);
  }

  function parseActions(input) {
    const lines = (input || "").split(/\r?\n/);
    let section = null;
    const out = [];
    const nodes = Array.from(document.querySelectorAll(LIST_SELECTOR))
      .map(n => (n.textContent || '').trim());

    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;

      if (/^shifts?$/i.test(line)) { section = "shifts"; continue; }
      if (/^total\b/i.test(line)) continue;
      if (section !== "shifts") continue;

      const stripped = line.replace(/^.*?\s+([a-z0-9._-]+\s*\(\d+\)\s*:.*)$/i, "$1");
      const m = stripped.match(/^([a-z0-9._-]+)\s*\(\d+\)\s*:\s*(.+)$/i);
      if (!m) continue;

      const name = m[1].trim();
      const displayName = NICK_DISPLAY[name] || name;
      const personIndex = nodes.findIndex(
        txt => txt.toLowerCase() === displayName.toLowerCase()
      );

      const days = m[2].split(",").map(s => s.trim()).filter(Boolean);
      for (const d of days) {
        const day = normalizeDay(d);
        if (day) out.push({ type: "Shift", name, personIndex, day });
      }
    }
    return out;
  }

  function normalizeDay(s) {
    const k = (s || "").slice(0,3).toLowerCase();
    const map = { mon:"Mon", tue:"Tue", wed:"Wed", thu:"Thu", fri:"Fri", sat:"Sat", sun:"Sun" };
    return map[k] || null;
  }

  function getScheduleBlocks() {
    const g = document.querySelector(CHART_GROUP_SELECTOR);
    if (!g) throw new Error("SVG group not found");
    const children = Array.from(g.children).filter(el => el.tagName !== "pattern" && el.tagName !== "filter");
    const blocks = [];
    let current = [];
    for (const el of children) {
      if (el.tagName.toLowerCase() === "line") {
        if (current.length) { blocks.push(current); current = []; }
      } else current.push(el);
    }
    if (current.length) blocks.push(current);
    return blocks;
  }

  function hasLeave(block) {
    const rects = block.filter(el => el.tagName.toLowerCase() === 'rect' && el.getAttribute('data-automation-id') === 'timelineevent');
    if (rects.length > 1) {
      const widths = rects.map(r => parseFloat(r.getAttribute('width')) || 0);
      const minWidth = Math.min(...widths);
      const maxWidth = Math.max(...widths);
      return (maxWidth - minWidth > 5);
    }
    return false;
  }

  async function openScheduleChangeDialogByDay(dayIndex, personIndex, name) {
    const block = getPersonBlock(personIndex);

    if (hasLeave(block)) {
      employeesWithLeave.add(name);
    }

    const target = getDayRect(block, dayIndex);
    imitateClick(target);
    await waitFor(POPUP_PANEL_SELECTOR, 4000);
  }

  async function finalizeReport() {
    const statusBox = document.querySelector('#sr-status');
    if (!statusBox) return;

    if (employeesWithLeave.size > 0) {
      let message = '\n';
      employeesWithLeave.forEach(n => {
        message += `⚠️ ${n} has a leave this week, please check their schedule.\n`;
      });
      statusBox.textContent += `\n${message.trim()}`;
    }

    statusBox.textContent += `\n✅ All actions processed`;
  }

  function getDayRect(block, dayIndex) {
    const rects = block.filter(
      (el) => el.tagName.toLowerCase() === "rect" &&
              el.getAttribute("data-automation-id") === "timelineevent"
    );
    if (dayIndex < 0 || dayIndex >= rects.length) {
      throw new Error(`Day index ${dayIndex} out of range`);
    }
    return rects[dayIndex];
  }

  function getPersonBlock(personIndex) {
    const blocks = getScheduleBlocks();
    if (personIndex == null || personIndex < 0 || personIndex >= blocks.length) {
      throw new Error(`Person index ${personIndex} out of range`);
    }
    return blocks[personIndex];
  }

  function imitateClick(target) {
    if (!target) return;
    try { target.scrollIntoView({ block: 'center', inline: 'center' }); } catch {}
    const r = target.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const mk = (type) => new MouseEvent(type, { bubbles:true, cancelable:true, view:unsafeWindow, clientX:cx, clientY:cy });
    target.dispatchEvent(mk('mousedown'));
    target.dispatchEvent(mk('mouseup'));
    target.dispatchEvent(mk('click'));
  }

  async function imitatePaste(input, value) {
    input.focus();
    try {
      if (typeof input.select === 'function') input.select();
      else if (typeof input.setSelectionRange === 'function') input.setSelectionRange(0, String(input.value || '').length);
    } catch {}
    await delay(100);
    const data = String(value);
    input.value = data;
    input.dispatchEvent(new InputEvent('input', { bubbles:true, cancelable:true, data, inputType:'insertFromPaste' }));
    input.blur();
    input.dispatchEvent(new Event('change', { bubbles:true }));
    await delay(400);
  }

  async function changeInTime(value = "05:00 AM") {
    const panel = await waitFor(POPUP_PANEL_SELECTOR, 2000);
    const input = panel.querySelector('ul li:nth-child(3) input');
    if (!input) throw new Error('IN input not found');
    await imitatePaste(input, value);
  }

  async function changeOutTime(value = "02:00 PM") {
    const panel = await waitFor(POPUP_PANEL_SELECTOR, 2000);
    const input = panel.querySelector('ul li:nth-child(4) input');
    if (!input) throw new Error('OUT input not found');
    await imitatePaste(input, value);
  }

  async function save() {
    const toolbar = await waitFor(TOOLBAR_SELECTOR, 2000);
    const okBtn = toolbar.querySelector('button[title="OK"]');
    if (!okBtn) throw new Error('OK button not found');
    okBtn.click();
  }

  async function processScheduleChange(action) {
    const dayIndex = DAY_TO_INDEX[action.day];
    if (dayIndex == null || action.personIndex == null || action.personIndex < 0) return;

    await openScheduleChangeDialogByDay(dayIndex, action.personIndex, action.name);
    await delay(500);

    await changeInTime("05:00 AM");
    await delay(500);

    await changeOutTime("02:00 PM");
    await delay(500);

    await save();
    await delay(5000);
  }

  function waitFor(selector, timeout = 3000) {
    return new Promise((resolve, reject) => {
      const el = document.querySelector(selector);
      if (el) return resolve(el);
      const t0 = Date.now();
      const mo = new MutationObserver(() => {
        const found = document.querySelector(selector);
        if (found) { mo.disconnect(); resolve(found); }
        else if (Date.now() - t0 > timeout) { mo.disconnect(); reject(new Error('Timeout: ' + selector)); }
      });
      mo.observe(document.documentElement, { childList:true, subtree:true });
      setTimeout(() => {
        mo.disconnect();
        const found = document.querySelector(selector);
        found ? resolve(found) : reject(new Error('Timeout: ' + selector));
      }, timeout);
    });
  }

  const delay = (ms)=>new Promise(r=>setTimeout(r,ms));
})();
