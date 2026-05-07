// ==UserScript==
// @name         Pandora Copy Helper
// @namespace    http://tampermonkey.net/
// @version      0.3
// @description  Copy helpers for pandora.ecwid.io tables
// @match        https://pandora.ecwid.io/*
// @updateURL    https://raw.githubusercontent.com/G-Ri-F-87/my-tools/main/tampermonkey/PandoraCopyHelper.tm.js
// @downloadURL  https://raw.githubusercontent.com/G-Ri-F-87/my-tools/main/tampermonkey/PandoraCopyHelper.tm.js
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const iconCss = `
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

    const icon = document.createElement('div');
    icon.textContent = '⎘';
    icon.style.cssText = iconCss;
    document.body.appendChild(icon);

    const billmanIcon = document.createElement('div');
    billmanIcon.textContent = '⎘';
    billmanIcon.style.cssText = iconCss;
    document.body.appendChild(billmanIcon);

    let currentCell = null;
    let currentBillmanCell = null;

    const getPanel = () => document.querySelector('.p-splitter .p-splitterpanel:nth-child(1)');

    const isBillmanRow = td => td.closest('tr.shift--billmanchats') !== null;

    const showIcon = (el, rect, offsetLeft = 26) => {
        el.style.top = (rect.top + 4) + 'px';
        el.style.left = (rect.right - offsetLeft) + 'px';
        el.style.opacity = '1';
        el.style.pointerEvents = 'auto';
    };

    const hideIcon = el => {
        el.style.opacity = '0';
        el.style.pointerEvents = 'none';
    };

    document.addEventListener('mouseover', (e) => {
        const td = e.target.closest('td');
        if (!td) return;

        const panel = getPanel();
        if (!panel || !panel.contains(td)) return;

        if (td.cellIndex === 0) return;

        const squadList = td.querySelector('div.squad-list');
        if (squadList && !squadList.innerText.trim()) return;

        const table = td.closest('table');

        if (isBillmanRow(td)) {
            currentBillmanCell = td;
            const rect = td.getBoundingClientRect();
            showIcon(billmanIcon, rect);
            return;
        }

        currentCell = td;

        const firstShiftRow = table && (table.querySelector('tr.shift--doublechats') || table.querySelector('tr.shift--chats'));
        const anchorCell = firstShiftRow ? firstShiftRow.cells[td.cellIndex] : null;

        const rect = (anchorCell || td).getBoundingClientRect();
        showIcon(icon, rect);
    });

    document.addEventListener('mouseout', (e) => {
        const td = e.target.closest('td');
        if (!td) return;

        if (td === currentCell) {
            if (e.relatedTarget === icon || icon.contains(e.relatedTarget)) return;
            hideIcon(icon);
            currentCell = null;
        }

        if (td === currentBillmanCell) {
            if (e.relatedTarget === billmanIcon || billmanIcon.contains(e.relatedTarget)) return;
            hideIcon(billmanIcon);
            currentBillmanCell = null;
        }
    });

    icon.addEventListener('mouseleave', () => {
        hideIcon(icon);
        currentCell = null;
    });

    billmanIcon.addEventListener('mouseleave', () => {
        hideIcon(billmanIcon);
        currentBillmanCell = null;
    });

    const flashIcon = (el) => {
        el.textContent = '✓';
        el.style.background = 'rgba(34, 197, 94, 0.85)';
        setTimeout(() => {
            el.textContent = '⎘';
            el.style.background = 'rgba(0, 0, 0, 0.6)';
        }, 1500);
    };

    const shuffle = arr => {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    };

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

        const parts = [shuffle([...nicknames]).join('\n')];
        if (callsNicknames.size) {
            parts.push('');
            parts.push('Calls');
            parts.push(shuffle([...callsNicknames]).join('\n'));
        }

        navigator.clipboard.writeText(parts.join('\n')).then(() => flashIcon(icon));
    });

    billmanIcon.addEventListener('click', () => {
        if (!currentBillmanCell) return;

        const nicknames = new Set();
        currentBillmanCell.querySelectorAll('div.squad-list > div[id]').forEach(el => {
            if (el.id) nicknames.add(el.id);
        });

        navigator.clipboard.writeText(shuffle([...nicknames]).join('\n')).then(() => flashIcon(billmanIcon));
    });
})();
