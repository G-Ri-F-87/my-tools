// ==UserScript==
// @name         Pandora Copy Helper
// @namespace    http://tampermonkey.net/
// @version      0.2
// @description  Copy helpers for pandora.ecwid.io tables
// @match        https://pandora.ecwid.io/*
// @updateURL    https://raw.githubusercontent.com/G-Ri-F-87/my-tools/main/tampermonkey/PandoraCopyHelper.tm.js
// @downloadURL  https://raw.githubusercontent.com/G-Ri-F-87/my-tools/main/tampermonkey/PandoraCopyHelper.tm.js
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const icon = document.createElement('div');
    icon.textContent = '⎘';
    icon.style.cssText = `
        position: fixed;
        width: 20px;
        height: 20px;
        background: rgba(0, 0, 0, 0.6);
        color: white;
        border-radius: 3px;
        font-size: 13px;
        line-height: 20px;
        text-align: center;
        cursor: pointer;
        z-index: 9999;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.15s;
        user-select: none;
    `;
    document.body.appendChild(icon);

    let currentCell = null;

    const getPanel = () => document.querySelector('.p-splitter .p-splitterpanel:nth-child(1)');

    document.addEventListener('mouseover', (e) => {
        const td = e.target.closest('td');
        if (!td) return;

        const panel = getPanel();
        if (!panel || !panel.contains(td)) return;

        if (td.cellIndex === 0) return;

        const squadList = td.querySelector('div.squad-list');
        if (squadList && !squadList.innerText.trim()) return;

        const table = td.closest('table');
        const firstShiftRow = table && (table.querySelector('tr.shift--doublechats') || table.querySelector('tr.shift--chats'));
        const anchorCell = firstShiftRow ? firstShiftRow.cells[td.cellIndex] : null;

        currentCell = td;

        const rect = (anchorCell || td).getBoundingClientRect();
        icon.style.top = (rect.top + 4) + 'px';
        icon.style.left = (rect.right - 26) + 'px';
        icon.style.opacity = '1';
        icon.style.pointerEvents = 'auto';
    });

    document.addEventListener('mouseout', (e) => {
        const td = e.target.closest('td');
        if (!td || td !== currentCell) return;
        if (e.relatedTarget === icon || icon.contains(e.relatedTarget)) return;
        icon.style.opacity = '0';
        icon.style.pointerEvents = 'none';
        currentCell = null;
    });

    icon.addEventListener('mouseleave', () => {
        icon.style.opacity = '0';
        icon.style.pointerEvents = 'none';
        currentCell = null;
    });

    icon.addEventListener('click', () => {
        if (!currentCell) return;
        const colIndex = currentCell.cellIndex;
        const table = currentCell.closest('table');
        if (!table) return;

        const nicknames = new Set();
        table.querySelectorAll('tr.shift--chats, tr.shift--doublechats, tr.shift--emails').forEach(row => {
            const cell = row.cells[colIndex];
            if (!cell) return;
            cell.querySelectorAll('div.squad-list > div[id]').forEach(el => {
                if (el.id) nicknames.add(el.id);
            });
        });

        const callsNicknames = new Set();
        const callsAnchorRows = table.querySelectorAll('tr.shift--emails').length
            ? table.querySelectorAll('tr.shift--emails')
            : table.querySelectorAll('tr.shift--socialchats');
        callsAnchorRows.forEach(anchorRow => {
            const next = anchorRow.nextElementSibling;
            if (!next || !next.classList.contains('shift--tier1duty')) return;
            const cell = next.cells[colIndex];
            if (!cell) return;
            cell.querySelectorAll('div.squad-list > div[id]').forEach(el => {
                if (el.id) callsNicknames.add(el.id);
            });
        });

        const shuffle = arr => {
            for (let i = arr.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [arr[i], arr[j]] = [arr[j], arr[i]];
            }
            return arr;
        };

        const parts = [shuffle([...nicknames]).join('\n')];
        if (callsNicknames.size) {
            parts.push('');
            parts.push('Calls');
            parts.push(shuffle([...callsNicknames]).join('\n'));
        }

        navigator.clipboard.writeText(parts.join('\n')).then(() => {
            icon.textContent = '✓';
            icon.style.background = 'rgba(34, 197, 94, 0.85)';
            setTimeout(() => {
                icon.textContent = '⎘';
                icon.style.background = 'rgba(0, 0, 0, 0.6)';
            }, 1500);
        });
    });
})();
