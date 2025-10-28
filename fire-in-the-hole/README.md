# Zendesk Original Email Linker

This Node.js script automates linking Zendesk tickets with user profiles by extracting the original email address from the ticket’s raw email source. It helps ensure tickets created via forwarded or proxy emails are associated with the correct requester.

---

## ⚙️ Prerequisites

To run this script on a new machine, make sure the following tools are installed:

### 1. Install Homebrew (macOS only)

Homebrew is a package manager for macOS.

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Then add Homebrew to your PATH if needed:

```bash
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"
```

### 2. Install Node.js and npm

Use Homebrew to install Node.js (which includes npm):

```bash
brew install node
```

Verify installation:

```bash
node -v
npm -v
```

✅ You should see version numbers printed for both commands.

---

## 🔧 Installation

Go to the project folder and install dependencies:

```bash
npm install
```

### 📄 Environment Setup

Create a `.env` file in the project root and add your Zendesk credentials:

```bash
ZENDESK_SUBDOMAIN=ecwidhelp
ZENDESK_EMAIL=your_email@domain.com
ZENDESK_API_TOKEN=your_zendesk_api_token

ZENDESK_SHARED_SESSION=your_cookie_value
ZENDESK_COOKIE=your_cookie_value
ZENDESK_SESSION=your_cookie_value
```

You can get these cookie values by logging into Zendesk in your browser, opening **Developer Tools → Application → Cookies**, and copying the values of:

- `_zendesk_shared_session`
- `_zendesk_cookie`
- `_zendesk_session`

Paste them into your `.env` file.


## 🚀 Usage

```bash
node zendesk_original_email.js --filter <FILTER_ID>
```

### Parameters

- `--filter <FILTER_ID>` — Zendesk view (filter) ID from which to process tickets.

## 📤 What the script does

1. Fetches **all tickets** from a given Zendesk filter (handles pagination).
2. Skips tickets not originating from `@ecwid-by-lightspeed.intercom-mail.com`.
3. Fetches all comments and locates the one containing the **original email metadata**.
4. Downloads the `original_email` HTML payload.
5. Parses and extracts the sender’s actual email address from the HTML source.
6. Searches for an existing Zendesk user with that email or creates one if missing.
7. Updates the ticket’s requester to match the found or created user.
8. Logs all actions and results to the console.


## 🧪 Example

```bash
node zendesk_original_email.js --filter 123456
```

Expected output:

```
Fetching tickets from filter 123456 (with pagination)...
Loaded 100 tickets so far...
Ticket 3141629: found email markku@patrikainen.info
✔ Ticket 3141629 is now assigned to requester 987654321
All tickets have been processed.
```

---

## 🧰 Troubleshooting

- **Error: missing Zendesk API credentials** → Check that `ZENDESK_EMAIL` and `ZENDESK_API_TOKEN` are present in `.env`.
- **Error: missing Zendesk cookies** → Log in to Zendesk and copy `_zendesk_shared_session`, `_zendesk_cookie`, and `_zendesk_session`.
- **Cannot fetch original email** → Ensure your account has permission to view ticket comments and attachments.


