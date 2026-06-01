# Support QA Ticket Exporter

Scripts for randomly sampling support conversations for QA purposes. Results are output in tab-separated format ready to paste into Google Sheets.

> **Note:** The team migrated from Zendesk to Intercom. Use `intercom_export.js` for current QA work. `zendesk_export.js` is kept for historical reference.

---

## ⚙️ Pre-requisites

To run these scripts on a new machine, make sure the following tools are installed:

1. Install Homebrew (macOS only)

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

2. After installation, add Homebrew to your PATH if needed:

```bash
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"
```

3. Install Node.js and npm

```bash
brew install node
```

Verify installation:

```bash
node -v
npm -v
```

## 🔧 Installation

Go to the script folder and install dependencies:

```bash
cd support-qa-preparer
npm install
```

---

## Intercom (current)

### 📄 .env Setup

Add the following to your `.env` file:

```env
INTERCOM_ACCESS_TOKEN=your_intercom_access_token
INTERCOM_APP_ID=your_app_id
```

- `INTERCOM_ACCESS_TOKEN` — find it in Intercom → Settings → Integrations → Developer Hub → your app → Authentication
- `INTERCOM_APP_ID` — the alphanumeric ID visible in your Intercom URL (e.g. `https://app.intercom.com/a/apps/abc123de/...`)

### 🚀 Usage

```bash
node intercom_export.js -a "agent1@example.com Agent Name1,agent2@example.com Agent Name2" -m 2025-04
```

Parameters:

- `-a` or `--agents` — comma-separated list of agent emails with full names
- `-m` or `--month` — month in `YYYY-MM` format
- `-b` or `--billing` — show only billing and login conversations instead of regular ones

### 📤 What the script does

1. Looks up agent IDs by email via the Intercom Admins API.
2. Fetches all **closed** conversations assigned to each agent within the given month.
3. Excludes conversations where `Callback requested` attribute is set (phone calls).
4. Excludes conversations where the agent never sent a reply.
5. Splits conversations into:
   - **chat** — Intercom Messenger conversations (`source.type = conversation`)
   - **email** — email conversations without a billing/login category
   - **billing** / **login** — email conversations with `E-Series Category = Billing` or `Login`
6. Randomly samples up to 15 conversations per category per agent.

Output format (tab-separated, paste directly into Google Sheets):

```
channel    agent_name    conversation_link
```

### 🧪 Examples

Regular QA sample (chat + email):

```bash
node intercom_export.js -a "jane@company.com Jane Down,bob@company.com Bob Smith" -m 2025-03
```

Billing/login sample only:

```bash
node intercom_export.js -b -a "jane@company.com Jane Down" -m 2025-03
```

Copy result to clipboard:

```bash
node intercom_export.js -a "jane@company.com Jane Down" -m 2025-03 | pbcopy
```

---

## Zendesk (legacy)

### 📄 .env Setup

```env
ZENDESK_SUBDOMAIN=your_zendesk_subdomain
ZENDESK_EMAIL=your_email@domain.com
ZENDESK_API_TOKEN=your_zendesk_api_token
```

### 🚀 Usage

```bash
node zendesk_export.js -a "agent1@example.com Agent Name1,agent2@example.com Agent Name2" -m 2025-04
```

Parameters:

- `-a` or `--agents` — comma-separated list of agent emails
- `-m` or `--month` — month in `YYYY-MM` format
- `-b` or `--billing` — show only billing issues

### 🧪 Example

```bash
node zendesk_export.js -a "jane@company.com Jane Down,bob@company.com Bob Smith" -m 2025-03 | pbcopy
```
