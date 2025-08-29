# Zendesk Chat Shift Checker

This script checks Zendesk Chat agent shifts for a given period and detects violations such as late logins, early logouts, or unusually early shift ends.

## ⚙️ Pre-requisites

To run this script on a new machine, make sure the following tools are installed:

1. Install Homebrew (macOS only)
   Homebrew is a package manager for macOS.

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

2. After installation, add Homebrew to your PATH if needed:

```bash
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"
```

3. Install Node.js and npm
   Use Homebrew to install Node.js, which includes npm:

```bash
brew install node
```

Verify installation:

```bash
node -v
npm -v
```

✅ You should see version numbers printed for both commands.
## 🔧 Installation
Go to the script folder:

```bash
npm install
```

📄 .env Setup
Create a `.env` file in the root directory and add the following variables:

```bash
ZENDESK_CHAT_TOKEN=your_zendesk_chat_token
ZENDESK_EMAIL=your_email@domain.com
ZENDESK_API_TOKEN=your_zendesk_api_token
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

1. Fetches all agent timeline events from Zendesk Chat Incremental API for the specified period.
2. Groups events by agent.
3. Detects shift violations:
   * **Late login** — agent logged in later than expected (+1 min grace).
   * **Early logout** — agent logged out earlier than 10 minutes before the expected end.
   * **Too early start** — agent started more than 5 minutes earlier than expected.
4. Resolves agent IDs to email addresses using Zendesk Users API.
5. Prints results to the console.
6. Optionally saves full debug data in `debug.dump`.
7. Sends a macOS notification when the check is complete.
🧪 Example

```bash
node schedule_check.js prev 
node schedule_check.js prev | grep -e agent.name -e agent.name2
```

* Checks the previous week shifts.
* Prints violations to the console.

