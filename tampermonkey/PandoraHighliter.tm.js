// ==UserScript==
// @name         Pandora Toggle and Schedule Tab Listener
// @namespace    rinat.tools
// @version      0.1.1
// @description  Simplified logs for clarity: combines Schedule Assessment click relaunch and row hover handling after modal close.
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
      if (btn.textContent.trim() === 'Schedule assessment') return btn;
    }
    return null;
  }

  function attachRowHoverHandler() {
    const panel = document.querySelector('.p-tabs .p-tabpanels .p-tabpanel:nth-child(3)');
    if (!panel) return requestAnimationFrame(attachRowHoverHandler);

    const rows = panel.querySelectorAll('tr');
    if (!rows.length) return requestAnimationFrame(attachRowHoverHandler);

    console.log(`✅ Hover handler active (${rows.length} rows)`);

    rows.forEach(row => {
      row.addEventListener('mouseenter', () => {
        const firstCell = row.querySelector('td');
        if (firstCell) highlightMatchingDivs(firstCell.textContent.trim());
      });
      row.addEventListener('mouseleave', removeHighlights);
    });
  }

  function highlightMatchingDivs(idText) {
    const splitterPanel = document.querySelector('.p-splitterpanel');
    if (!splitterPanel) return requestAnimationFrame(() => highlightMatchingDivs(idText));

    const matchingDivs = splitterPanel.querySelectorAll(`div[id='${idText}']`);
    removeHighlights();

    matchingDivs.forEach(div => {
      div.dataset.originalBg = div.style.backgroundColor || '';
      div.style.transition = 'background-color 0.3s ease';
      div.style.backgroundColor = '#FFFF00';
      div.style.borderRadius = '8px';
    });
  }

  function removeHighlights() {
    const highlighted = document.querySelectorAll('.p-splitterpanel div[style*="background-color"]');
    highlighted.forEach(div => {
      div.style.backgroundColor = div.dataset.originalBg || '';
      div.style.borderRadius = '';
      div.style.transition = '';
      delete div.dataset.originalBg;
    });
  }

  function handleDateControlPopup() {
    const dateControlButtons = document.querySelectorAll('.date-control button');
    if (!dateControlButtons.length) return requestAnimationFrame(handleDateControlPopup);

    console.log(`🟡 Date controls detected (${dateControlButtons.length})`);

    dateControlButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const observeModal = new MutationObserver(() => {
          const modal = document.querySelector('.modal');
          if (!modal) return;

          const generateSpan = modal.querySelector('span');
          if (generateSpan && generateSpan.textContent.trim() === 'Generate') {
            const generateBtn = generateSpan.closest('button');
            if (generateBtn) {
              console.log('⚙️ Generate modal open');

              generateBtn.addEventListener('click', () => {
                console.log('🟠 Generate clicked — waiting for modal to close');

                const waitForModalClose = new MutationObserver(() => {
                  const stillModal = document.querySelector('.modal');
                  if (!stillModal) {
                    waitForModalClose.disconnect();
                    console.log('✅ Modal closed — refreshing data');
                    requestAnimationFrame(() => {
                      const scheduleBtn = findScheduleAssessmentButton();
                      if (scheduleBtn) scheduleBtn.click();
                      setTimeout(() => attachRowHoverHandler(), 500);
                    });
                  }
                });

                waitForModalClose.observe(document.body, { childList: true, subtree: true });
              });
            }
          }
        });

        observeModal.observe(document.body, { childList: true, subtree: true });
      });
    });
  }

  function attachScheduleButtonListener() {
    const scheduleBtn = findScheduleAssessmentButton();
    if (!scheduleBtn) return requestAnimationFrame(attachScheduleButtonListener);
    console.log('📘 Schedule Assessment ready');
    scheduleBtn.addEventListener('click', attachRowHoverHandler);
  }

  function addToggleLogger() {
    const toggle = document.querySelector('.p-menubar .p-menubar-end .p-toggleswitch');
    if (!toggle) return requestAnimationFrame(addToggleLogger);

    setTimeout(() => {
      console.log('🔘 Toggle active');
      toggle.addEventListener('click', attachScheduleButtonListener);
    }, 500);
  }

  window.addEventListener('load', () => {
    console.log('🚀 Pandora schedule script started');
    addToggleLogger();
    handleDateControlPopup();
  });
})();