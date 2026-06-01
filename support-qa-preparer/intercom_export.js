#!/usr/bin/env node

import dotenv from 'dotenv';
import { program } from 'commander';
import axios from 'axios';
import lodash from 'lodash';
import dayjs from 'dayjs';

dotenv.config();

const REQUIRED_ENV_VARS = [
  'INTERCOM_ACCESS_TOKEN',
  'INTERCOM_APP_ID'
];

function checkEnv() {
  const missing = REQUIRED_ENV_VARS.filter(v => !process.env[v]);
  if (missing.length > 0) {
    console.error(`❌ Missing required environment variables in .env:\n  ${missing.join('\n  ')}`);
    console.error(`\nPlease add them to your .env file, for example:\n`);
    console.error(`INTERCOM_ACCESS_TOKEN=your_intercom_access_token`);
    console.error(`INTERCOM_APP_ID=your_app_id`);
    process.exit(1);
  }
}

checkEnv();

const intercom = axios.create({
  baseURL: 'https://api.intercom.io',
  headers: {
    Authorization: `Bearer ${process.env.INTERCOM_ACCESS_TOKEN}`,
    Accept: 'application/json',
    'Intercom-Version': '2.10'
  }
});

async function getAdminMap() {
  const response = await intercom.get('/admins');
  const admins = response.data.admins || [];
  return Object.fromEntries(admins.map(a => [a.email, a.id]));
}

async function getConversationsForAgents(agents, month, billingMode) {
  const adminMap = await getAdminMap();

  const start = dayjs(`${month}-01`);
  const end = start.endOf('month');

  const results = [];

  for (const agent of agents) {
    const adminId = adminMap[agent.email];
    if (!adminId) {
      console.error(`⚠️  Admin not found for email: ${agent.email}`);
      continue;
    }

    let startingAfter = null;
    const fullResponse = [];

    do {
      const body = {
        query: {
          operator: 'AND',
          value: [
            { field: 'admin_assignee_id', operator: '=', value: String(adminId) },
            { field: 'created_at', operator: '>=', value: start.unix() },
            { field: 'created_at', operator: '<=', value: end.unix() },
            { field: 'state', operator: '=', value: 'closed' }
          ]
        },
        pagination: {
          per_page: 150,
          ...(startingAfter ? { starting_after: startingAfter } : {})
        }
      };

      const response = await intercom.post('/conversations/search', body);
      const conversations = response.data.conversations || [];
      fullResponse.push(...conversations.map(c => ({ ...c, agent })));

      startingAfter = response.data.pages?.next?.starting_after || null;
    } while (startingAfter);

    const { chat, email, billing } = separateAndSampleConversations(fullResponse);
    if (billingMode) {
      results.push(...billing);
    } else {
      results.push(...chat, ...email);
    }
  }

  return results;
}

function separateAndSampleConversations(conversations, count = 15) {
  function getBillingChannel(conv) {
    const category = conv.custom_attributes?.['E-Series Category']?.toLowerCase();
    if (category === 'billing') return 'billing';
    if (category === 'login') return 'login';
    return null;
  }

  // exclude call-back requests and conversations where agent never replied
  const nonCalls = conversations
    .filter(c => !c.custom_attributes?.['Callback requested'])
    .filter(c => c.statistics?.first_admin_reply_at);

  // chats: source type is "conversation" (Intercom Messenger)
  const chatCandidates = nonCalls.filter(c => c.source?.type === 'conversation');

  // emails: source type is "email"
  const emailCandidates = nonCalls.filter(c => c.source?.type === 'email');

  const billing = emailCandidates
    .filter(c => getBillingChannel(c) !== null)
    .map(c => ({ ...c, _channel: getBillingChannel(c) }));

  const email = emailCandidates
    .filter(c => getBillingChannel(c) === null)
    .map(c => ({ ...c, _channel: 'email' }));

  const chat = chatCandidates.map(c => ({ ...c, _channel: 'chat' }));

  return {
    billing: lodash.sampleSize(billing, count),
    chat: lodash.sampleSize(chat, count),
    email: lodash.sampleSize(email, count),
  };
}

function printConversationsForSpreadsheet(conversations, appId) {
  const rows = conversations.map(c =>
    `${c._channel}\t${c.agent.name}\thttps://app.intercom.com/a/apps/${appId}/inbox/conversation/${c.id}`
  );
  console.log(rows.join('\n'));
}

async function main({ agents, month, billingMode }) {
  const conversations = await getConversationsForAgents(agents, month, billingMode);
  printConversationsForSpreadsheet(conversations, process.env.INTERCOM_APP_ID);
}

program
  .requiredOption('-a, --agents <emails>', 'Comma-separated list of agent emails with name from gSuite')
  .requiredOption('-m, --month <month>', 'Month in format YYYY-MM')
  .option('-b, --billing', 'Show only billing conversations')
  .parse();

const options = program.opts();
const agents = options.agents
  .split(',')
  .map(a => a.trim())
  .map(str => str.split(' '))
  .map(([email, ...rest]) => ({ email, name: rest.join(' ') }));
const month = options.month;
const billingMode = options.billing;

main({ agents, month, billingMode }).catch(err => {
  console.error('❌ Execution error: ', err.message);
  if (err.response) {
    console.error('API response:', JSON.stringify(err.response.data, null, 2));
  }
  process.exit(1);
});
