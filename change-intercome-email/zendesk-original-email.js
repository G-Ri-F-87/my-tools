// zendesk-original-email.js
// Usage:
//   node zendesk-original-email.js --filter <FILTER_ID1> <FILTER_ID2> ...
//   node zendesk-original-email.js --search-all

const fetch = require('node-fetch');
const dotenv = require('dotenv');
dotenv.config();

const SUBDOMAIN = process.env.ZENDESK_SUBDOMAIN;
const EMAIL = process.env.ZENDESK_EMAIL;
const API_TOKEN = process.env.ZENDESK_API_TOKEN;
const COOKIE_SHARED = process.env.ZENDESK_SHARED_SESSION;
const COOKIE_MAIN = process.env.ZENDESK_COOKIE;
const COOKIE_SESSION = process.env.ZENDESK_SESSION;

if (!SUBDOMAIN) {
  console.error('Error: make sure ZENDESK_SUBDOMAIN is defined in .env');
  process.exit(1);
}

if (!EMAIL || !API_TOKEN) {
  console.error(`Error: missing Zendesk API authentication credentials.\n` +
    `Add the following variables to your .env file:\n` +
    `  ZENDESK_EMAIL=your_email@example.com\n  ZENDESK_API_TOKEN=your_api_token`);
  console.error('If you do not want to use API tokens, set up cookie-based authentication.');
}

if (!COOKIE_SHARED || !COOKIE_MAIN || !COOKIE_SESSION) {
  console.error(`Error: missing Zendesk cookies.\n` +
    `Log in to Zendesk in your browser and copy the following cookies:\n` +
    `  _zendesk_shared_session, _zendesk_cookie, _zendesk_session\n` +
    `Add them to your .env file as:\n` +
    `  ZENDESK_SHARED_SESSION=...\n  ZENDESK_COOKIE=...\n  ZENDESK_SESSION=...`);
  process.exit(1);
}

const auth = EMAIL && API_TOKEN ? Buffer.from(`${EMAIL}/token:${API_TOKEN}`).toString('base64') : null;

async function zendeskRequest(path, options = {}) {
  const url = `https://${SUBDOMAIN}.zendesk.com/api/v2${path}`;
  const headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  };

  if (auth) headers['Authorization'] = `Basic ${auth}`;

  if (COOKIE_SHARED || COOKIE_MAIN || COOKIE_SESSION) {
    headers['Cookie'] = [
      COOKIE_SHARED ? `_zendesk_shared_session=${COOKIE_SHARED}` : '',
      COOKIE_MAIN ? `_zendesk_cookie=${COOKIE_MAIN}` : '',
      COOKIE_SESSION ? `_zendesk_session=${COOKIE_SESSION}` : ''
    ].filter(Boolean).join('; ');
  }

  const resp = await fetch(url, { headers, ...options });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Zendesk API returned ${resp.status} ${resp.statusText}: ${body}`);
  }
  return resp.json();
}

async function getTicketsFromFilter(filterId) {
  console.log(`\nFetching tickets from filter ${filterId} (with pagination)...`);
  let tickets = [];
  let page = `/views/${filterId}/tickets.json?page=1`;

  while (page) {
    const data = await zendeskRequest(page.replace(`/api/v2`, ''));
    if (data.tickets && data.tickets.length) {
      tickets = tickets.concat(data.tickets.map(t => t.id));
      console.log(`Loaded ${tickets.length} tickets so far...`);
    }

    if (data.next_page) {
      page = data.next_page.replace(`https://${SUBDOMAIN}.zendesk.com/api/v2`, '');
    } else {
      page = null;
    }
  }

  console.log(`Total tickets found in filter ${filterId}: ${tickets.length}`);
  return tickets;
}

async function searchTicketsAll() {
  console.log(`\nSearching all open tickets from Intercom senders...`);
  let tickets = [];
  let page = `/search.json?query=${encodeURIComponent('requester:*@ecwid-by-lightspeed.intercom-mail.com status:open')}`;

  while (page) {
    const data = await zendeskRequest(page.replace(`/api/v2`, ''));
    if (data.results && data.results.length) {
      const found = data.results.filter(r => r.result_type === 'ticket').map(r => r.id);
      tickets = tickets.concat(found);
      console.log(`Loaded ${tickets.length} tickets so far...`);
    }

    if (data.next_page) {
      page = data.next_page.replace(`https://${SUBDOMAIN}.zendesk.com/api/v2`, '');
    } else {
      page = null;
    }
  }

  console.log(`Total tickets found by search: ${tickets.length}`);
  return tickets;
}

async function getTicketMetadata(ticketId) {
  const data = await zendeskRequest(`/tickets/${ticketId}.json`);
  return data.ticket?.via?.source?.from?.address || null;
}

async function getOriginalEmail(ticketId, commentId) {
  const url = `https://${SUBDOMAIN}.zendesk.com/tickets/${ticketId}/comments/${commentId}/original_email`;
  const headers = {
    'Accept': 'text/html,application/xhtml+xml',
    'User-Agent': 'Mozilla/5.0'
  };
  if (COOKIE_SHARED || COOKIE_MAIN || COOKIE_SESSION) {
    headers['Cookie'] = [
      COOKIE_SHARED ? `_zendesk_shared_session=${COOKIE_SHARED}` : '',
      COOKIE_MAIN ? `_zendesk_cookie=${COOKIE_MAIN}` : '',
      COOKIE_SESSION ? `_zendesk_session=${COOKIE_SESSION}` : ''
    ].filter(Boolean).join('; ');
  }

  const resp = await fetch(url, { headers });
  if (!resp.ok) {
    console.error(`Failed to fetch original_email for ticket ${ticketId}: ${resp.status} ${resp.statusText}`);
    return null;
  }
  return await resp.text();
}

async function getTicketComments(ticketId) {
  const data = await zendeskRequest(`/tickets/${ticketId}/comments.json`);
  return data.comments || [];
}

function findEmailCommentWithFullSource(comments) {
  if (!Array.isArray(comments) || comments.length === 0) return null;
  return comments.find(c => c.via?.channel === 'email' && c.via?.source?.from?.original_recipients);
}

function extractEmailValue(html) {
  const regex = />\s*EMAIL\s*<\/td>[\s\S]{0,1000}?([\w.-]+@[\w.-]+\.[A-Za-z]{2,6})/i;
  const match = html.match(regex);
  return match?.[1] || null;
}

async function findOrCreateUserByEmail(email) {
  try {
    const searchRes = await zendeskRequest(`/users/search.json?query=${encodeURIComponent(email)}`);
    if (Array.isArray(searchRes.users) && searchRes.users.length > 0) return searchRes.users[0];

    const createRes = await zendeskRequest('/users.json', {
      method: 'POST',
      body: JSON.stringify({ user: { email, name: email } })
    });
    return createRes.user;
  } catch (err) {
    console.error('Error while searching or creating user:', err.message || err);
    return null;
  }
}

async function updateTicketRequester(ticketId, userId) {
  try {
    await zendeskRequest(`/tickets/${ticketId}.json`, {
      method: 'PUT',
      body: JSON.stringify({ ticket: { requester_id: userId } })
    });
    console.log(`✔ Ticket ${ticketId} is now assigned to requester ${userId}`);
  } catch (err) {
    console.error(`Error updating ticket ${ticketId}:`, err.message || err);
  }
}

async function processTicket(ticketId) {
  try {
    const fromAddress = await getTicketMetadata(ticketId);
    if (!fromAddress || !fromAddress.endsWith('@ecwid-by-lightspeed.intercom-mail.com')) {
      console.log(`Ticket ${ticketId}: skipped (not from intercom-mail.com).`);
      return;
    }

    const comments = await getTicketComments(ticketId);
    const match = findEmailCommentWithFullSource(comments);
    if (!match) {
      console.log(`Ticket ${ticketId}: no comment with original email found.`);
      return;
    }

    const html = await getOriginalEmail(ticketId, match.id);
    if (!html) return;

    const foundEmail = extractEmailValue(html);
    if (!foundEmail) {
      console.log(`Ticket ${ticketId}: could not find email after <td>EMAIL</td>.`);
      return;
    }

    console.log(`Ticket ${ticketId}: found email ${foundEmail}`);
    const user = await findOrCreateUserByEmail(foundEmail);
    if (user && user.id) await updateTicketRequester(ticketId, user.id);
  } catch (err) {
    console.error(`Error processing ticket ${ticketId}:`, err.message || err);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const filterIndex = args.indexOf('--filter');
  const searchAll = args.includes('--search-all');

  let allTicketIds = [];

  if (searchAll) {
    allTicketIds = await searchTicketsAll();
  } else if (filterIndex !== -1 && args[filterIndex + 1]) {
    const filterIds = args.slice(filterIndex + 1).map(id => id.trim()).filter(Boolean);
    for (const filterId of filterIds) {
      const ticketIds = await getTicketsFromFilter(filterId);
      allTicketIds = allTicketIds.concat(ticketIds);
    }
  } else {
    console.log('Usage: node zendesk-original-email.js --filter <FILTER_ID1> <FILTER_ID2> ... | --search-all');
    process.exit(1);
  }

  console.log(`\nTotal tickets to process: ${allTicketIds.length}`);

  for (const id of allTicketIds) {
    await processTicket(id);
  }

  console.log('\nAll tickets have been processed.');
}

main();