# Zendesk Ticket Exporter

This script randomly selects 30 Zendesk tickets (15 chat and 15 email) for a given month and agent list, then uploads them to a Google Sheet for QA purposes.

## 🔧 Installation

Go to the script folder

```bash
npm install
```

📄 .env Setup
Create a .env file in the root directory and add the following variables:

```env
ZENDESK_SUBDOMAIN=your_zendesk_subdomain
ZENDESK_EMAIL=your_email@domain.com
ZENDESK_API_TOKEN=your_zendesk_api_token
```

## 🚀 Usage

```bash
node zendesk_export.js -a "agent1@example.com Agent Name1,agent2@example.com Agent Name2" -m 2025-04
```

Parameters:
-a or --agents — comma-separated list of agent emails

-m or --month — month in YYYY-MM format

### 📤 What the script does

1. Retrieves tickets assigned to the specified agents within the given month.

2. Filters out tickets with status new.
3.  Randomly selects 15 chat and 15 email tickets (if available).

Outputs results to the console in a tab-separated format:

```php-template
channel<TAB>email<TAB>ticket_link
```

This format is designed to be copied and pasted directly into Google Sheets.

🧪 Example

```bash
node zendesk_export.js -a "jane@company.com Jane Down,bob@company.com Bob Smith" -m 2025-03
```

To copy resull into Clipboard use the following

```bash
node zendesk_export.js -a "jane@company.com Jane Down,bob@company.com Bob Smith" -m 2025-03 | pbcopy
```
