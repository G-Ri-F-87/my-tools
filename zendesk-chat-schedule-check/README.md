# Intercom Chat Shift Checker

This script checks Intercom teammate shifts for a given period and detects violations such as late logins, early logouts, or unusually early shift starts. It uses the Intercom Activity Log API, tracking `teammate_away_mode_change` events.

## ⚙️ Pre-requisites

1. Install Homebrew (macOS only):
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

2. Install Node.js:
```bash
brew install node
```

## 🔧 Installation

```bash
npm install
```

## 📄 .env Setup

Create a `.env` file in the root directory:

```bash
INTERCOM_ACCESS_TOKEN=your_intercom_access_token
```

## 🚀 Usage

```bash
node schedule_check.js [this|prev|YYYY-MM-DD_YYYY-MM-DD] [debug]
```

### Parameters

* `this` — current week (from Monday to the current hour)
* `prev` — previous week
* `YYYY-MM-DD_YYYY-MM-DD` — custom date range
* `debug` — optional, saves a detailed dump in `debug.dump`

### 📤 What the script does

1. Fetches all `teammate_away_mode_change` activity log events from Intercom for the specified period.
2. Groups events by agent (`away_mode: false` → online, `away_mode: true` → away).
3. Detects shift violations:
   * **Late login** — agent logged in later than expected (+1 min grace).
   * **Early logout** — agent logged out earlier than 10 minutes before the expected end.
   * **Too early start** — agent started more than 5 minutes earlier than expected.
4. Resolves agent names directly from event data (no extra API calls needed).
5. Prints results to the console.
6. Optionally saves full debug data in `debug.dump`.
7. Sends a macOS notification when the check is complete.

## 🧪 Example

```bash
node schedule_check.js prev
node schedule_check.js prev | grep agent.name
```
