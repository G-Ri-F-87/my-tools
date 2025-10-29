// ==UserScript==
// @name         Pandora Toggle and Schedule Tab Listener
// @namespace    rinat.tools
// @version      0.1.0
// @description  Adds a click handler to the first menubar toggle, attaches a click listener to the 'Schedule assessment' tab, adds hover on tabpanel rows and highlights matching divs by id inside splitter panel with bright yellow background style
// @match        https://pandora.ecwid.io/*
// @grant        none
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/G-Ri-F-87/my-tools/main/tampermonkey/PandoraHighliter.tm.js
// @downloadURL  https://raw.githubusercontent.com/G-Ri-F-87/my-tools/main/tampermonkey/PandoraHighliter.tm.js
// ==/UserScript==

(function() {
  'use strict';

  function findScheduleAssessmentButton() {
    const buttons = document.querySelectorAll('.p-tabs .p-tablist .p-tablist-content button');
    for (const btn of buttons) {
      if (btn.textContent.trim() === 'Schedule assessment') {
        return btn;
      }
    }
    return null;
  }

  function attachRowHoverHandler() {
    const panel = document.querySelector('.p-tabs .p-tabpanels .p-tabpanel:nth-child(3)');
    if (!panel) {
      requestAnimationFrame(attachRowHoverHandler);
      return;
    }

    const rows = panel.querySelectorAll('tr');
    if (!rows.length) {
      requestAnimationFrame(attachRowHoverHandler);
      return;
    }

    console.log('✅ Hover handlers attached to rows');

    rows.forEach(row => {
      row.addEventListener('mouseenter', () => {
        const firstCell = row.querySelector('td');
        if (firstCell) {
          const idText = firstCell.textContent.trim();
          highlightMatchingDivs(idText);
        }
      });

      row.addEventListener('mouseleave', () => {
        removeHighlights();
      });
    });
  }

  function highlightMatchingDivs(idText) {
    const splitterPanel = document.querySelector('.p-splitterpanel');
    if (!splitterPanel) {
      requestAnimationFrame(() => highlightMatchingDivs(idText));
      return;
    }

    const matchingDivs = splitterPanel.querySelectorAll(`div[id='${idText}']`);
    removeHighlights();

    if (matchingDivs.length > 0) {
      console.log(`✨ Highlight ${matchingDivs.length} element(s) for id="${idText}"`);
    }

    matchingDivs.forEach(div => {
      div.dataset.originalBg = div.style.backgroundColor || '';
      div.style.transition = 'background-color 0.3s ease';
      div.style.backgroundColor = '#FFFF00'; // bright yellow highlight
      div.style.borderRadius = '8px';
    });
  }

  function removeHighlights() {
    const highlighted = document.querySelectorAll('.p-splitterpanel div[style*="background-color"]');
    if (highlighted.length > 0) {
      console.log('🧹 Highlights removed');
    }
    highlighted.forEach(div => {
      div.style.backgroundColor = div.dataset.originalBg || '';
      div.style.borderRadius = '';
      div.style.transition = '';
      delete div.dataset.originalBg;
    });
  }

  function attachScheduleButtonListener() {
    const scheduleBtn = findScheduleAssessmentButton();
    if (!scheduleBtn) {
      requestAnimationFrame(attachScheduleButtonListener);
      return;
    }

    scheduleBtn.addEventListener('click', () => {
      console.log('🟣 Schedule assessment tab clicked');
      attachRowHoverHandler();
    });

    console.log('✅ Schedule assessment listener added');
  }

  function addToggleLogger() {
    const toggle = document.querySelector('.p-menubar .p-menubar-end .p-toggleswitch');
    if (!toggle) {
      requestAnimationFrame(addToggleLogger);
      return;
    }

    toggle.addEventListener('click', () => {
      console.log('🟢 Toggle clicked');
      attachScheduleButtonListener();
    });

    console.log('✅ Toggle listener added');
  }

  window.addEventListener('load', addToggleLogger);
})();