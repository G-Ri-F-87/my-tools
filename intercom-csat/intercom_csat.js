#!/usr/bin/env node

import dotenv from 'dotenv';
import { program } from 'commander';
import axios from 'axios';
import dayjs from 'dayjs';

dotenv.config();

const REQUIRED_ENV_VARS = ['INTERCOM_TOKEN', 'AGENTS'];

function checkEnv() {
  const missing = REQUIRED_ENV_VARS.filter(v => !process.env[v]);
  if (missing.length > 0) {
    console.error(`❌ Missing required environment variables in .env:\n  ${missing.join('\n  ')}`);
    process.exit(1);
  }
}

checkEnv();

const intercom = axios.create({
  baseURL: 'https://api.intercom.io',
  headers: {
    Authorization: `Bearer ${process.env.INTERCOM_TOKEN}`,
    Accept: 'application/json',
    'Intercom-Version': '2.10'
  }
});

const agentEmails = process.env.AGENTS.split(',').map(e => e.trim().toLowerCase());

async function getTeammates() {
  const res = await intercom.get('/admins');
  const all = res.data.admins ?? [];
  const matched = all.filter(a => agentEmails.includes(a.email.toLowerCase()));
  if (matched.length === 0) {
    console.error('❌ No teammates found matching AGENTS emails. Available:');
    all.forEach(a => console.error(`  ${a.email}`));
    process.exit(1);
  }
  return matched;
}

async function getConversationsWithRating(teammateId, startTs, endTs) {
  const results = [];
  let startingAfter = null;

  do {
    const body = {
      query: {
        operator: 'AND',
        value: [
          { field: 'teammate_ids', operator: 'IN', value: [String(teammateId)] },
          { field: 'created_at', operator: '>', value: startTs },
          { field: 'created_at', operator: '<', value: endTs },
          { field: 'open', operator: '=', value: false }
        ]
      },
      pagination: {
        per_page: 150,
        ...(startingAfter ? { starting_after: startingAfter } : {})
      }
    };

    const res = await intercom.post('/conversations/search', body);
    const conversations = res.data.conversations ?? [];
    results.push(...conversations.filter(c => c.conversation_rating));
    startingAfter = res.data.pages?.next?.starting_after ?? null;
  } while (startingAfter);

  return results;
}

// Intercom ratings: 5=amazing, 4=good, 3=neutral, 2=bad, 1=terrible
// CSAT = (positive) / (positive + negative) — neutral excluded
function calcCSAT(conversations) {
  let positive = 0;
  let negative = 0;

  for (const c of conversations) {
    const rating = c.conversation_rating?.rating;
    if (rating >= 4) positive++;
    else if (rating <= 2) negative++;
  }

  const total = positive + negative;
  const pct = total > 0 ? ((positive / total) * 100).toFixed(1) : '—';
  return { positive, negative, total, pct };
}

function printResults(rows) {
  const cols = ['Agent', 'Positive', 'Negative', 'Total', 'CSAT%'];
  console.log(cols.join('\t'));

  let sumPos = 0;
  let sumNeg = 0;

  for (const { name, stats } of rows) {
    console.log([name, stats.positive, stats.negative, stats.total, stats.total > 0 ? stats.pct + '%' : '—'].join('\t'));
    sumPos += stats.positive;
    sumNeg += stats.negative;
  }

  const totalTotal = sumPos + sumNeg;
  const totalPct = totalTotal > 0 ? ((sumPos / totalTotal) * 100).toFixed(1) + '%' : '—';
  console.log(['TOTAL', sumPos, sumNeg, totalTotal, totalPct].join('\t'));
}

async function main({ month }) {
  const startTs = dayjs(`${month}-01`).unix();
  const endTs = dayjs(`${month}-01`).endOf('month').unix();

  console.error(`Fetching CSAT for ${month}...`);

  const teammates = await getTeammates();
  const rows = [];

  for (const teammate of teammates) {
    console.error(`  → ${teammate.name}`);
    const conversations = await getConversationsWithRating(teammate.id, startTs, endTs);
    const stats = calcCSAT(conversations);
    rows.push({ name: teammate.name, stats });
  }

  console.error('');
  printResults(rows);
}

program
  .requiredOption('-m, --month <month>', 'Month in format YYYY-MM')
  .parse();

const { month } = program.opts();

main({ month }).catch(err => {
  console.error('❌ Error:', err.response?.data ?? err.message);
  process.exit(1);
});
