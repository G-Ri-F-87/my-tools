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
if (args.length !== 1) {
    console.log("Usage: node schedule_check.js [this|prev|YYYY-MM-DD_YYYY-MM-DD]");
    process.exit(1);
}

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


// Fetch all agent timeline records with pagination and progress bar
async function fetchAllAgentTimeline(startTime) {
    let allTimeline = [];
    let url = `${BASE_CHAT_URL}?start_time=${startTime.getTime() * 1000}`;

    const progressBar = new cliProgress.SingleBar({
        format: 'Fetching timeline |{bar}| {value} pages fetched ',
        hideCursor: true
    }, cliProgress.Presets.shades_classic);

    let pagesFetched = 0;
    progressBar.start(20, 0);

    while (url) {
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
    }

    progressBar.stop();
    return allTimeline;
}

// Group timeline records by agent ID
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

// Round timestamp down to previous odd hour (e.g., 11:47 -> 11:00, 14:05 -> 13:00)
function roundDownToOddHour(date) {
    const hours = date.getUTCHours();
    const oddHour = hours % 2 === 0 ? hours - 1 : hours;
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), oddHour, 0, 0));
}

// Detect late online appearance: if agent's first appearance after odd hour + 5 min
function detectLateAppearances(timelineMap) {
  const results = [];

  for (const [agentId, records] of timelineMap.entries()) {
    const sorted = records
      .map((r) => ({ ...r, ts: parseISO(r.start_time) }))
      .sort((a, b) => a.ts - b.ts);

    let i = 0;
    while (i < sorted.length) {
      // Step 1: find the next online status
      while (i < sorted.length && sorted[i].status !== "online") i++;
      if (i >= sorted.length) break;

      const sessionStart = sorted[i];
      i++;

      // Step 2: look for "invisible" that ends the shift
      let sessionEndIndex = -1;
      for (let j = i; j < sorted.length; j++) {
        const r = sorted[j];
        if (r.status === "invisible") {
          const nextOnline = sorted.slice(j + 1).find((e) => e.status === "online");
          const gap =
            nextOnline && nextOnline.ts
              ? nextOnline.ts.getTime() - r.ts.getTime()
              : Infinity;

          if (gap > 5 * 60 * 1000) {
            sessionEndIndex = j;
            break;
          }
        }
      }

      // Step 3: calculate expected start and compare with actual
      const expectedStart = roundDownToOddHour(sessionStart.ts);
      const graceStart = addMinutes(expectedStart, 1); // 1-minute grace

      if (isAfter(sessionStart.ts, graceStart)) {
        results.push({
          agentId,
          actualStart: sessionStart.ts,
          expectedStart,
          status: sessionStart.status,
          duration: sessionStart.duration,
        });
      }

      // Step 4: move index to next possible session
      i = sessionEndIndex > 0 ? sessionEndIndex + 1 : i + 1;
    }
  }

  return results;
}




// Resolve agent ID to display name using Zendesk Users API with progress bar
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
            const res = await axios.get(
                `${BASE_USERS_URL}/${id}`,
                { headers: USERS_HEADERS }
            );
            names[id] = res.data.user.email;
        } catch {
            names[id] = `Agent#${id}`;
        }
        progressBar.update(i + 1);
    }

    progressBar.stop();
    return names;
}

// Main
(async () => {
    try {
        console.log("⏳ Collecting shifts...");
        let timeline = await fetchAllAgentTimeline(startDate);

        console.log("📖 Processing data and detecting late appearances...");
        const grouped = groupTimelineByAgent(timeline);
        const lateAppearances = detectLateAppearances(grouped);

        if (lateAppearances.length === 0) {
            console.log("✅ No late online appearances detected.");
            return;
        }

        const uniqueIds = [...new Set(lateAppearances.map(e => e.agentId))];
        console.log("⏳ Fetching agent information...");
        const names = await resolveAgentNames(uniqueIds);

        console.log("⏰ Late online appearances:");
        for (const rec of lateAppearances) {
            console.log(`👤 ${names[rec.agentId]} — appeared at ${rec.actualStart.toISOString()}, expected by ${rec.expectedStart.toISOString()}`);
        }
        exec(`osascript -e 'display notification "Schedule check completed" with title "Zendesk Script"'`);
    } catch (e) {
        console.error("❌ Unexpected error occurred:", e.message);
        process.exit(1);
    }
})();
