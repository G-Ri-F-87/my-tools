// ==UserScript==
// @name         Wootric Dashboard Automation
// @namespace    rinat.tools
// @version      1.4.2
// @downloadURL  https://raw.githubusercontent.com/G-Ri-F-87/my-tools/main/tampermonkey/WootricStat.tm.js
// @updateURL    https://raw.githubusercontent.com/G-Ri-F-87/my-tools/main/tampermonkey/WootricStat.tm.js
// @description  Automates repetitive actions in Wootric Dashboard and extracts CSAT data in spreadsheet format with dynamic month selector
// @match        https://dashboard.wootric.com/*
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const config = {
    debug: true,
    names: [
      'Aiah', 'vince', 'Joanne', 'Jesse', 'Joselle',
      'Joven Balbastro', 'Rina Dela Rosa', 'Kerren Perez', 'Jassiel Gallego',
      'Chester Nepomuceno', 'Jennifer Tio', 'Camela Valdez'
    ]
  };

  const log = (...args) => config.debug && console.log('[Wootric]', ...args);
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function getPreviousMonthAbbr() {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const date = new Date();
    const prev = new Date(date.getFullYear(), date.getMonth() - 1, 1);
    return months[prev.getMonth()];
  }

  async function askMonth() {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.style.position = 'fixed';
      overlay.style.top = '0';
      overlay.style.left = '0';
      overlay.style.width = '100%';
      overlay.style.height = '100%';
      overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
      overlay.style.display = 'flex';
      overlay.style.alignItems = 'center';
      overlay.style.justifyContent = 'center';
      overlay.style.zIndex = '9999';

      const box = document.createElement('div');
      box.style.background = '#fff';
      box.style.padding = '20px';
      box.style.borderRadius = '10px';
      box.style.textAlign = 'center';
      box.style.fontFamily = 'sans-serif';

      const label = document.createElement('label');
      label.textContent = 'Select month:';
      label.style.display = 'block';
      label.style.marginBottom = '10px';
      label.style.fontWeight = 'bold';

      const select = document.createElement('select');
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      for (const m of months) {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m;
        select.appendChild(opt);
      }
      select.value = getPreviousMonthAbbr();
      select.style.marginBottom = '15px';

      const button = document.createElement('button');
      button.textContent = 'Start';
      button.style.padding = '6px 16px';
      button.style.border = 'none';
      button.style.borderRadius = '6px';
      button.style.background = '#007bff';
      button.style.color = '#fff';
      button.style.cursor = 'pointer';

      button.onclick = () => {
        const selectedMonth = select.value;
        overlay.remove();
        resolve(selectedMonth);
      };

      box.appendChild(label);
      box.appendChild(select);
      box.appendChild(button);
      overlay.appendChild(box);
      document.body.appendChild(overlay);
    });
  }

  function getReports() {
    const containers = Array.from(document.querySelectorAll('.ai-dashboard__grid__item-content'));
    const reports = containers.map(container => {
      const nameEl = container.querySelector('.ai-report__column--left .ai-report__name.ai-report__header__name');
      const name = nameEl ? nameEl.textContent.trim() : null;
      const rightCol = container.querySelector('.ai-report__column--right');
      return name ? { name, container, rightCol } : null;
    }).filter(Boolean);

    const filtered = reports.filter(r => config.names.some(n => r.name.toLowerCase().includes(n.toLowerCase())));
    log('Filtered reports:', filtered.map(r => r.name));
    return filtered;
  }

  function findMonthGroup(svg, targetMonth) {
    const firstLevelGroups = Array.from(svg.querySelectorAll(':scope > g'));
    for (const outerG of firstLevelGroups) {
      const innerGroups = Array.from(outerG.querySelectorAll(':scope > g'));
      const monthG = innerGroups.find(g => {
        const t = g.querySelector('text');
        return t && t.textContent.trim() === 'Month';
      });
      if (!monthG) continue;

      const monthGroups = Array.from(monthG.querySelectorAll(':scope > g'));
      for (const mg of monthGroups) {
        const textEl = mg.querySelector('text');
        if (textEl && textEl.textContent.includes(targetMonth)) {
          return mg;
        }
      }
    }
    return null;
  }

  async function scrollAndHover(element, monthLabel, svg) {
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(1000);

    const monthRect = element.getBoundingClientRect();
    const chartEventTriggerElem = svg.querySelector('g.c3-event-rects rect');
    if (!chartEventTriggerElem) return log('No c3-event-rects rect found.');

    let x = monthRect.left + monthRect.width / 2;
    let y = monthRect.top + monthRect.height / 2 - 20;

    const mouseover = new unsafeWindow.MouseEvent('mouseover', { bubbles: true, cancelable: true, clientX: x, clientY: y, view: unsafeWindow });
    chartEventTriggerElem.dispatchEvent(mouseover);

    await sleep(1000);

    y -= 5;
    const move = new unsafeWindow.MouseEvent('mousemove', { bubbles: true, cancelable: true, clientX: x, clientY: y, view: unsafeWindow });
    chartEventTriggerElem.dispatchEvent(move);
    log(`Hovered ${monthLabel} for tooltip extraction.`);

    await sleep(500);
  }

  function extractTooltipData(container, name) {
    const tooltip = container.querySelector('div.c3-tooltip-container table');
    if (!tooltip) return null;

    const rows = Array.from(tooltip.querySelectorAll('tr'));
    if (rows.length < 5) return null;

    const monthRow = rows[0];
    const monthText = monthRow.textContent.trim();

    const data = {};
    const metrics = ['Satisfied', 'Neutral', 'Unsatisfied', 'CSAT Score'];

    for (const metric of metrics) {
      const tr = tooltip.querySelector(`.c3-tooltip-name--${metric.replace(/ /g, '-')}`);
      if (tr) {
        const valueCell = tr.querySelector('td.value');
        data[metric] = valueCell ? valueCell.textContent.trim() : null;
      }
    }

    return { name, month: monthText, ...data };
  }

  function printResults(results) {
    console.group('📊 CSAT Results');
    for (const r of results) {
      const header = `${r.name}\t${r.month}`;
      const line = `${r['CSAT Score'] || ''}\t${r['Unsatisfied'] || ''}\t${r['Neutral'] || ''}\t${r['Satisfied'] || ''}`;
      console.log(header + '\n' + line + '\n');
    }
    console.groupEnd();
  }

  async function runCSATAutomation() {
    try {
      const targetMonth = await askMonth();
      log(`Selected month: ${targetMonth}`);

      log('Starting CSAT automation...');
      const reports = getReports();
      const results = [];

      for (const { name, rightCol } of reports) {
        const svg = rightCol.querySelector('.ai-report__charts svg');
        if (!svg) continue;

        const monthGroup = findMonthGroup(svg, targetMonth);
        if (!monthGroup) continue;

        await scrollAndHover(monthGroup, targetMonth, svg);
        const tooltipData = extractTooltipData(rightCol, name);
        if (tooltipData) results.push(tooltipData);
      }

      printResults(results);
      log('CSAT extraction completed.');
      return results;
    } catch (err) {
      console.error('[Wootric Automation Error]', err);
    }
  }

  GM_registerMenuCommand('CSAT report', runCSATAutomation);
})();
