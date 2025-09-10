#!/usr/bin/env node

import dotenv from 'dotenv';
import { program } from 'commander';
import axios from 'axios';
import lodash from 'lodash';
import dayjs from 'dayjs';

dotenv.config();

const REQUIRED_ENV_VARS = [
  'ZENDESK_SUBDOMAIN',
  'ZENDESK_EMAIL',
  'ZENDESK_API_TOKEN'
];

// Check for required environment variables
function checkEnv() {
  const missing = REQUIRED_ENV_VARS.filter(v => !process.env[v]);
  if (missing.length > 0) {
    console.error(`❌ Missing required environment variables in .env:\n  ${missing.join('\n  ')}`);
    console.error(`\nPlease add them to your .env file, for example:\n`);
    console.error(`ZENDESK_SUBDOMAIN=your_subdomain`);
    console.error(`ZENDESK_EMAIL=your_email@domain.com`);
    console.error(`ZENDESK_API_TOKEN=your_zendesk_api_token`);
    process.exit(1);
  }
}

checkEnv();

// Zendesk API client
const zendesk = axios.create({
  baseURL: `https://${process.env.ZENDESK_SUBDOMAIN}.zendesk.com/api/v2`,
  auth: {
    username: `${process.env.ZENDESK_EMAIL}/token`,
    password: process.env.ZENDESK_API_TOKEN
  }
});

// Fetch tickets for the specified agents and month
async function getTicketsForAgents(agents, month, billingMode) {
  const start = dayjs(`${month}-01`);
  const end = start.endOf('month');

  const results = [];

  for (const agent of agents) {
    let url = '/search.json';
    let params = {
      query: `type:ticket assignee:${agent.email} created>=${start.format('YYYY-MM-DD')} created<=${end.format('YYYY-MM-DD')} -status:open`
    };
    const fullResponse = [];
    while (url) {
      const response = await zendesk.get(url, { params });
      fullResponse.push(...response.data.results.map(ticket => ({ ...ticket, agent })));
      url = response.data.next_page;
      params = {};

    }
    const { chat, email, billing } = separateAndSampleTickets(fullResponse)
    if (billingMode) {
      results.push(...billing);
    } else {
      results.push(...chat, ...email);
    }

  }
  return results;
}

// Separate and randomly select chat and email tickets
function separateAndSampleTickets(tickets, count = 15) {
  // helper: check if ticket has billing-related tag
  function hasBillingTag(ticket) {
    return (
      ticket.tags &&
      (ticket.tags.includes("billing") ||
        ticket.tags.includes("billing-issue") ||
        ticket.tags.includes("login-issue"))
    );
  }

  // helper: rewrite ticket channel to given value
  function rewriteChannel(ticket, channel) {
    return {
      ...ticket,
      via: {
        ...ticket.via,
        channel,
      },
    };
  }

  // group: chat (normalize channel to "chat")
  const chat = tickets
    .filter((t) => t.via && t.via.channel === "chat")
    .map((t) => rewriteChannel(t, "chat"));

  // group: email/web tickets with agent reply
  const emailCandidates = tickets
    .filter(
      (t) =>
        t.via &&
        (t.via.channel === "email" || t.via.channel === "web")
    )
    .filter((t) => t.tags && t.tags.includes("agent_replied"));

  // group: billing 
  const billing = emailCandidates
    .filter(hasBillingTag)
    .map((t) => rewriteChannel(t, "billing"));

  // group: email without billing
  const email = emailCandidates
    .filter((t) => !hasBillingTag(t))
    .map((t) => rewriteChannel(t, "email"));

  return {
    billing: lodash.sampleSize(billing, count),
    chat: lodash.sampleSize(chat, count),
    email: lodash.sampleSize(email, count),
  };
}

function printTicketsForSpreadsheet(tickets, zendeskDomain) {
  const rows = tickets.map(t =>
    `${t.via?.channel || ''}\t${t.agent.name}\thttps://${zendeskDomain}.zendesk.com/agent/tickets/${t.id}`
  );
  console.log(rows.join('\n'));
}

// Main function
async function main({ agents, month, billingMode }) {
  const tickets = await getTicketsForAgents(agents, month, billingMode);

  printTicketsForSpreadsheet(tickets, process.env.ZENDESK_SUBDOMAIN);
}

// CLI interface
program
  .requiredOption('-a, --agents <emails> <name>', 'Comma-separated list of agent emails with name from gSuite')
  .requiredOption('-m, --month <month>', 'Month in format YYYY-MM')
  .option('-b, --billing', 'Show only billing tickets')
  .parse();

const options = program.opts();
const agents = options.agents
  .split(',')
  .map(a => a.trim())
  .map(str => str.split(' '))
  .map(([email, ...rest]) => ({ email: email, name: rest.join(' ') }));
const month = options.month;
const billingMode = options.billing;



main({ agents, month, billingMode }).catch(err => {
  console.error('❌ Execution error: ', err.message);
  process.exit(1);
});
