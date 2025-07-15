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
} from "date-fns";
import { exec } from "child_process";
import fs from "fs/promises";

dotenv.config();

const CHAT_TOKEN = process.env.ZENDESK_CHAT_TOKEN;
const ZENDESK_EMAIL = process.env.ZENDESK_EMAIL;
const ZENDESK_API_TOKEN = process.env.ZENDESK_API_TOKEN;

if (!CHAT_TOKEN || !ZENDESK_EMAIL || !ZENDESK_API_TOKEN) {
    console.error("❌ Please set ZENDESK_CHAT_TOKEN, ZENDESK_EMAIL and ZENDESK_API_TOKEN in your .env");
    process.exit(1);
}

const BASE_CHAT_URL = 'https://ecwidhelp.zendesk.com/api/v2/chat/incremental/agent_timeline';
const BASE_USERS_URL = 'https://ecwidhelp.zendesk.com/api/v2/users';

const CHAT_HEADERS = {
    Authorization: `Bearer ${CHAT_TOKEN}`,
};

const usersAuth = Buffer.from(`${ZENDESK_EMAIL}/token:${ZENDESK_API_TOKEN}`).toString('base64');
const USERS_HEADERS = {
    Authorization: `Basic ${usersAuth}`,
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

async function fetchAllAgentTimeline(startTime) {
    let allTimeline = [];
    let url = `${BASE_CHAT_URL}?start_time=${startTime.getTime() * 1000}`;

    const progressBar = new cliProgress.SingleBar({
        format: 'Fetching timeline |{bar}| {value} pages fetched ',
        hideCursor: true
    }, cliProgress.Presets.shades_classic);

    let pagesFetched = 0;
    progressBar.start(20, 0);

    do {
        let res;
        try {
            res = await axios.get(url, { headers: CHAT_HEADERS });
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
        allTimeline = allTimeline.concat(data.agent_timeline);

        pagesFetched++;
        progressBar.update(pagesFetched);

        if (!data.next_page || !data.end_time) break;

        const nextTime = new Date(data.end_time / 1000);
        if (isAfter(nextTime, endDate)) break;

        url = data.next_page;
    } while (url)

    progressBar.stop();
    return allTimeline;
}

function groupTimelineByAgent(records) {
    const map = new Map();
    for (const r of records) {
        const ts = parseISO(r.start_time);
        if (isBefore(ts, startDate) || isAfter(ts, endDate)) continue;
        if (!map.has(r.agent_id)) map.set(r.agent_id, []);
        map.get(r.agent_id).push({ ...r, ts });
    }
    return map;
}

function roundDownToOddHour(date) {
    const hours = date.getUTCHours();
    const oddHour = hours % 2 === 0 ? hours - 1 : hours;
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), oddHour, 0, 0));
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
                if (r.status === "invisible") {
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

            if (isLate || isEarly || isTooEarly) {
                results.push({
                    agentId,
                    expectedStart,
                    actualStart: sessionStart.ts,
                    expectedEnd,
                    actualEnd,
                    isLate,
                    isEarly,
                    isTooEarly
                });
            }

            i = sessionEndIndex > 0 ? sessionEndIndex + 1 : i + 1;
        }
    }

    return results;
}

async function resolveAgentNames(agentIds) {
    const names = {};
    console.log(`🔍 Resolving agent names for ${agentIds.length} agents...`);

    const progressBar = new cliProgress.SingleBar({
        format: 'Fetching agent info |{bar}| {value}/{total}',
        hideCursor: true
    }, cliProgress.Presets.shades_classic);

    progressBar.start(agentIds.length, 0);

    for (let i = 0; i < agentIds.length; i++) {
        const id = agentIds[i];
        try {
            const res = await axios.get(`${BASE_USERS_URL}/${id}`, { headers: USERS_HEADERS });
            names[id] = res.data.user.email;
        } catch {
            names[id] = `Agent#${id}`;
        }
        progressBar.update(i + 1);
    }

    progressBar.stop();
    return names;
}

function printShiftViolations(violations, names) {
    if (violations.length === 0) {
        console.log("✅ Everyone was on time and left on time.");
        return;
    }

    for (const v of violations) {
        const name = names[v.agentId] || `Agent#${v.agentId}`;

        if (v.isLate && v.isEarly) {
            console.log(`⚠️ ${name} was late and left early: ${v.actualStart.toISOString()} — ${v.actualEnd.toISOString()}`);
        } else if (v.isLate) {
            console.log(`⏰ ${name} was late: ${v.actualStart.toISOString()} (expected ${v.expectedStart.toISOString()})`);
        } else if (v.isEarly) {
            console.log(`📉 ${name} left early at ${v.actualEnd.toISOString()} (expected until ${v.expectedEnd.toISOString()})`);
        } else if (v.isTooEarly) {
            console.log(`⚠️ ${name} started unusually early at ${v.actualStart.toISOString()} (expected from ${v.expectedStart.toISOString()})`);
        }
    }
}

(async () => {
    try {
        console.log("⏳ Collecting shifts...");
        let timeline = await fetchAllAgentTimeline(startDate);

        console.log("📖 Processing data and detecting shift violations...");
        const grouped = groupTimelineByAgent(timeline);
        const violations = detectShiftViolations(grouped);

        const uniqueIds = [...new Set([...violations.map(e => e.agentId), ...grouped.keys()])];
        const names = await resolveAgentNames(uniqueIds);

        printShiftViolations(violations, names);

        if (debugMode) {
            const dump = {
                startDate: startDate.toISOString(),
                endDate: endDate.toISOString(),
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

        exec(`osascript -e 'display notification "Schedule check completed" with title "Zendesk Script"'`);
    } catch (e) {
        console.error("❌ Unexpected error occurred:", e.message);
        process.exit(1);
    }
})();