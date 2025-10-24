// ==UserScript==
// @name         Shift Map Extractor (pandora.ecwid.io)
// @namespace    rinat.tools
// @version      1.0.2
// @description  Extracts shifts and day-offs for selected agents on pandora.ecwid.io and prints a formatted report in the console.
// @match        https://pandora.ecwid.io/*
// @grant        GM_registerMenuCommand
// @run-at       document-idle
//
// === Summary ===
// This Tampermonkey script runs on pandora.ecwid.io.
// From the Tampermonkey menu, choose "Run Shift Map" to:
//   • Collect working shifts (incident, billmanchats, double chats, chats)
//   • Collect day-offs (dayoff, vacation)
//   • Filter agents by the predefined allowed list
//   • Print a formatted report to the browser console:
//        - Each agent: number of days and the list of days
//        - Totals for each section (Day Off, Shifts)
// =================
// ==/UserScript==

(function () {
  "use strict";

  const cfg = {
    days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    incidentRowSelector: "tr.shift--incidenter",
    billmanRowSelector: "tr.shift--billmanchats",
    doubleRowSelector: "tr.shift--doublechats",
    chatsRowSelector: null, // if null, uses the next row after doubleRow
    dayoffRowSelector: "tr.shift--dayoff",
    vacationRowSelector: "tr.shift--vacation",
    agentSelector: ".agent-chip > div > span",
    allowedAgents: [
      "camela.valdez",
      "chester.nepomuceno",
      "iris.osano",
      "jamie.nicanor",
      "jay.quiachon",
      "joanne.orden",
      "joselle.necio",
      "joven.balbastro",
      "kerren.perez",
      "kristianne.diamat",
      "mark.lopez",
      "rina.delarosa",
      "vincent.robin",
      "jennifer.tio",
      "jassiel.gallego",
    ],
  };

  const allowedSet = new Set(cfg.allowedAgents);
  const q = (s) => document.querySelector(s);
  const qa = (r, s) => Array.from(r?.querySelectorAll?.(s) || []);
  const pickCell = (row, i) => row?.querySelectorAll("td")[i + 1] || null;
  const getAgents = (cell) =>
    qa(cell, cfg.agentSelector)
      .map((s) => s.textContent.trim())
      .filter((a) => allowedSet.has(a));

  function extract() {
    const incidentRow = q(cfg.incidentRowSelector);
    const billmanRow = q(cfg.billmanRowSelector);
    const doubleRow = q(cfg.doubleRowSelector);
    const chatsRow = cfg.chatsRowSelector
      ? q(cfg.chatsRowSelector)
      : doubleRow?.nextElementSibling;

    if (!incidentRow || !billmanRow || !doubleRow || !chatsRow) {
      throw new Error("Shift rows not found — check selectors.");
    }

    const dayoffRow = q(cfg.dayoffRowSelector) || null;
    const vacationRow = q(cfg.vacationRowSelector) || null;

    const shifts = Object.create(null);
    const dayoffs = Object.create(null);

    // Shifts
    cfg.days.forEach((day, i) => {
      const ic = pickCell(incidentRow, i);
      const bc = pickCell(billmanRow, i);
      const dc = pickCell(doubleRow, i);
      const cc = pickCell(chatsRow, i);
      if (!(ic && bc && dc && cc)) return;

      const names = new Set([
        ...getAgents(ic),
        ...getAgents(bc),
        ...getAgents(dc),
        ...getAgents(cc),
      ]);
      names.forEach((n) => (shifts[n] = (shifts[n] || []).concat(day)));
    });

    // Dayoffs
    cfg.days.forEach((day, i) => {
      const doC = pickCell(dayoffRow, i);
      const vaC = pickCell(vacationRow, i);
      if (!doC && !vaC) return;

      const names = new Set([...getAgents(doC), ...getAgents(vaC)]);
      names.forEach((n) => (dayoffs[n] = (dayoffs[n] || []).concat(day)));
    });

    return { shifts, dayoffs };
  }

  function printSection(title, data) {
    console.log(`\n${title}`);
    let total = 0;
    cfg.allowedAgents.forEach((name) => {
      if (data[name]) {
        const days = data[name];
        console.log(`${name} (${days.length}): ${days.join(", ")}`);
        total += days.length;
      }
    });
    console.log(`Total: ${total}`);
  }

  function run() {
    try {
      const { shifts, dayoffs } = extract();
      printSection("Day Off", dayoffs);
      printSection("Shifts", shifts);
    } catch (e) {
      console.error(e);
      alert("Error — see console for details.");
    }
  }

  // Add menu entry
  GM_registerMenuCommand("Run Shift Map", run);
})();
