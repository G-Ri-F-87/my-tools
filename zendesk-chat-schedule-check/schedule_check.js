import axios from "axios";
import dotenv from "dotenv";
import cliProgress from "cli-progress";
import {
    parseISO,
    startOfWeek,
    endOfWeek,
    subWeeks,
    isAfter,
    isBefore,
    addMinutes,
    subMinutes,
    startOfHour,
    addHours,
} from "date-fns";
import { exec } from "child_process";
import fs from "fs/promises";

dotenv.config();

const INTERCOM_ACCESS_TOKEN = process.env.INTERCOM_ACCESS_TOKEN;

if (!INTERCOM_ACCESS_TOKEN) {
    console.error("❌ Please set INTERCOM_ACCESS_TOKEN in your .env");
    process.exit(1);
}

const BASE_URL = 'https://api.intercom.io/admins/activity_logs';

const HEADERS = {
    Authorization: `Bearer ${INTERCOM_ACCESS_TOKEN}`,
    Accept: 'application/json',
    'Intercom-Version': '2.10',
};

const args = process.argv.slice(2);
if (args.length < 1 || args.length > 2) {
    console.log("Usage: node schedule_check.js [this|prev|YYYY-MM-DD_YYYY-MM-DD] [debug]");
    process.exit(1);
}

const debugMode = args.includes("debug");

const parseDateRange = (arg) => {
    const now = new Date();
    if (arg === 'this') {
        const start = startOfWeek(now, { weekStartsOn: 1 });
        const end = startOfHour(now);
        return [start, end];
    } else if (arg === 'prev') {
        const prev = subWeeks(now, 1);
        return [startOfWeek(prev, { weekStartsOn: 1 }), endOfWeek(prev, { weekStartsOn: 1 })];
    } else {
        const [startStr, endStr] = arg.split("_");
        return [new Date(startStr), new Date(endStr)];
    }
};

const [startDate, endDate] = parseDateRange(args[0]);
console.log(`📅 Checking from ${startDate.toISOString()} to ${endDate.toISOString()}`);

async function fetchActivityLogs(startDate, endDate) {
    let allLogs = [];
    let pagesDebug = [];
    const startUnix = Math.floor(startDate.getTime() / 1000);
    const endUnix = Math.floor(endDate.getTime() / 1000);

    const progressBar = new cliProgress.SingleBar({
        format: 'Fetching activity logs |{bar}| {value} pages fetched ',
        hideCursor: true
    }, cliProgress.Presets.shades_classic);

    let pagesFetched = 0;
    progressBar.start(100, 0);

    let url = `${BASE_URL}?created_at_after=${startUnix}&created_at_before=${endUnix}`;
    do {
        let res;
        try {
            res = await axios.get(url, { headers: HEADERS });
        } catch (error) {
            progressBar.stop();
            if (error.response) {
                console.error(`❌ Request failed [${error.response.status}]: ${JSON.stringify(error.response.data)}`);
                console.error(`URL: ${url}`);
            } else {
                console.error(`❌ Network or setup error: ${error.message}`);
            }
            process.exit(1);
        }

        const data = res.data;
        const filtered = (data.activity_logs || []).filter(e => e.activity_type === "admin_away_mode_change");
        allLogs = allLogs.concat(filtered);

        pagesFetched++;
        progressBar.update(pagesFetched);

        pagesDebug.push(data.pages);
        url = typeof data.pages?.next === 'string' ? data.pages.next : null;
    } while (url);

    progressBar.stop();
    return { logs: allLogs, pagesDebug };
}

function groupEventsByAgent(events) {
    const map = new Map();
    for (const e of events) {
        const ts = new Date(e.created_at * 1000);
        if (isBefore(ts, startDate) || isAfter(ts, endDate)) continue;
        const agentId = e.performed_by.id;
        const status = e.metadata?.away_mode === false ? "online" : "away";
        if (!map.has(agentId)) map.set(agentId, []);
        map.get(agentId).push({ agentId, status, ts, start_time: ts.toISOString() });
    }
    return map;
}

function roundDownToOddHour(date) {
    const hours = date.getUTCHours();
    const oddHour = hours % 2 === 0 ? hours - 1 : hours;
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), oddHour, 0, 0));
}

function toUTC_HHMM(date) {
    const h = String(date.getUTCHours()).padStart(2, "0");
    const m = String(date.getUTCMinutes()).padStart(2, "0");
    return `${h}:${m}`;
}

function detectShiftViolations(timelineMap) {
    const results = [];
    const GRACE_MINUTES = 1;
    const EARLY_LEAVE_THRESHOLD_MS = 10 * 60 * 1000;
    const EARLY_ARRIVAL_THRESHOLD_MS = 5 * 60 * 1000;
    const SHIFT_DURATION_MS = 2 * 60 * 60 * 1000;

    for (const [agentId, records] of timelineMap.entries()) {
        const sorted = records
            .map((r) => ({ ...r, ts: parseISO(r.start_time) }))
            .sort((a, b) => a.ts - b.ts);

        for (let i = 0; i < sorted.length;) {
            if (sorted[i].status !== "online") {
                i++;
                continue;
            }

            const sessionStart = sorted[i];
            i++;

            let sessionEndIndex = -1;
            for (let j = i; j < sorted.length; j++) {
                const r = sorted[j];
                if (r.status === "invisible" || r.status === "away") {
                    const nextOnline = sorted.slice(j + 1).find((e) => e.status === "online");
                    const gap = nextOnline?.ts ? nextOnline.ts.getTime() - r.ts.getTime() : Infinity;
                    if (gap > 5 * 60 * 1000) {
                        sessionEndIndex = j;
                        break;
                    }
                }
            }

            const expectedStart = roundDownToOddHour(sessionStart.ts);
            const graceStart = addMinutes(expectedStart, GRACE_MINUTES);
            const earlyAcceptableStart = subMinutes(expectedStart, EARLY_ARRIVAL_THRESHOLD_MS / 60000);

            const expectedEnd = new Date(expectedStart.getTime() + SHIFT_DURATION_MS);
            const earlyLeaveThreshold = new Date(expectedEnd.getTime() - EARLY_LEAVE_THRESHOLD_MS);

            const actualEnd = sessionEndIndex !== -1 ? sorted[sessionEndIndex].ts : sessionStart.ts;

            const isLate = isAfter(sessionStart.ts, graceStart);
            const isTooEarly = isBefore(sessionStart.ts, earlyAcceptableStart);
            const isEarly = isAfter(earlyLeaveThreshold, actualEnd);

            // build compacted event chain (online, invisible, away)
            const slice = sorted.slice(
                sorted.indexOf(sessionStart),
                sessionEndIndex !== -1 ? sessionEndIndex + 1 : sorted.length
            );

            const sessionEvents = slice
                .map(ev => {
                    const start = ev.ts;
                    const end = ev.duration ? new Date(ev.ts.getTime() + ev.duration * 1000) : null;
                    return { status: ev.status, start, end };
                })
                .reduce((acc, ev) => {
                    const last = acc[acc.length - 1];
                    if (last && last.status === ev.status) {
                        if (ev.end && (!last.end || ev.end > last.end)) {
                            last.end = ev.end;
                        }
                    } else {
                        acc.push({ ...ev });
                    }
                    return acc;
                }, [])
                .map(ev => {
                    const startStr = toUTC_HHMM(ev.start);
                    const endStr = ev.end ? toUTC_HHMM(ev.end) : "";
                    return `${ev.status}(${startStr}${endStr ? "-" + endStr : ""})`;
                })
                .join("|");

            if (isLate || isEarly || isTooEarly) {
                results.push({
                    agentId,
                    expectedStart,
                    actualStart: sessionStart.ts,
                    expectedEnd,
                    actualEnd,
                    isLate,
                    isEarly,
                    isTooEarly,
                    sessionEvents
                });
            }

            i = sessionEndIndex > 0 ? sessionEndIndex + 1 : i + 1;
        }
    }

    return results;
}

function buildAgentNames(events) {
    const names = {};
    for (const e of events) {
        if (e.performed_by?.id && e.performed_by?.email) {
            names[e.performed_by.id] = e.performed_by.email;
        }
    }
    return names;
}

function getTeamShiftLabel(expectedStartUTC) {
    function formatSlot(team, localStart, localEnd) {
        const pad = (n) => String(n).padStart(2, "0");
        return `${team} ${pad(localStart.getUTCHours())}:00-${pad(localEnd.getUTCHours())}:00`;
    }

    // navy shift: GMT+10
    const navyStart = addHours(expectedStartUTC, 10);
    const navyEnd = addHours(expectedStartUTC, 12);
    if (navyStart.getUTCHours() >= 7 && navyStart.getUTCHours() < 15) {
        return formatSlot("navy", navyStart, navyEnd);
    }

    // terra shift: GMT+4
    const terraStart = addHours(expectedStartUTC, 4);
    const terraEnd = addHours(expectedStartUTC, 6);
    // special case: shift can cross midnight
    if (terraStart.getUTCHours() >= 9 ?? terraStart.getUTCHours() < 1) {
        return formatSlot("terra", terraStart, terraEnd);
    }

    return "unknown shift";
}

function printShiftViolations(violations, names) {
    if (violations.length === 0) {
        console.log("✅ Everyone was on time and left on time.");
        return;
    }

    for (const v of violations) {
        let name = names[v.agentId] || `Agent#${v.agentId}`;
        // remove @lightspeedhq.com if present
        if (name.endsWith("@lightspeedhq.com")) {
            name = name.replace("@lightspeedhq.com", "");
        }
        const shiftLabel = getTeamShiftLabel(v.expectedStart);

        if (v.isLate && v.isEarly) {
            console.log(`⚠️ ${name} was late and left early\t${formatToUTC(v.actualStart)} — ${formatToUTC(v.actualEnd)}\t(expected ${formatToUTC(v.expectedStart)} — ${formatToUTC(v.expectedEnd)}|${shiftLabel})\t${v.sessionEvents}`);
        } else if (v.isLate) {
            console.log(`⏰ ${name} was late\t${formatToUTC(v.actualStart)}\t(expected ${formatToUTC(v.expectedStart)}|${shiftLabel})\t${v.sessionEvents}`);
        } else if (v.isEarly) {
            console.log(`📉 ${name} left early\t${formatToUTC(v.actualEnd)}\t(expected until ${formatToUTC(v.expectedEnd)}|${shiftLabel})\t${v.sessionEvents}`);
        } else if (v.isTooEarly) {
            console.log(`⚠️ ${name} started unusually early\t${formatToUTC(v.actualStart)}\t(expected from ${formatToUTC(v.expectedStart)}|${shiftLabel})\t${v.sessionEvents}`);
        }
    }
}


function formatToUTC(date) {

    const yyyy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0'); // месяцы с 0
    const dd = String(date.getUTCDate()).padStart(2, '0');

    const hh = String(date.getUTCHours()).padStart(2, '0');
    const min = String(date.getUTCMinutes()).padStart(2, '0');
    const ss = String(date.getUTCSeconds()).padStart(2, '0');

    return `${dd}-${mm}-${yyyy} ${hh}:${min}:${ss} UTC`;
}

(async () => {
    try {
        console.log("⏳ Collecting shifts...");
        const { logs: timeline, pagesDebug } = await fetchActivityLogs(startDate, endDate);

        console.log("📖 Processing data and detecting shift violations...");
        const grouped = groupEventsByAgent(timeline);
        const violations = detectShiftViolations(grouped);

        const names = buildAgentNames(timeline);

        printShiftViolations(violations, names);

        if (debugMode) {
            const dump = {
                startDate: startDate.toISOString(),
                endDate: endDate.toISOString(),
                pagesDebug,
                agentNames: names,
                rawTimeline: timeline,
                groupedTimeline: Object.fromEntries(
                    [...grouped.entries()].map(([id, records]) => [id, records.map(r => ({ ...r, ts: r.ts.toISOString() }))])
                ),
                violations
            };
            await fs.writeFile("debug.dump", JSON.stringify(dump, null, 2));
            console.log("🪵 Debug data written to debug.dump");
        }

        exec(`osascript -e 'display notification "Schedule check completed" with title "Intercom Script"'`);
    } catch (e) {
        console.error("❌ Unexpected error occurred:", e.message);
        process.exit(1);
    }
})();