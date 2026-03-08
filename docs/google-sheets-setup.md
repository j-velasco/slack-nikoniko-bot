# Google Sheets Setup

## 1. Create a Google Cloud Project

1. Go to https://console.cloud.google.com/
2. Create a new project (or use an existing one)
3. Enable the **Google Sheets API** under APIs & Services > Library

## 2. Create a Service Account

1. Go to APIs & Services > Credentials
2. Click "Create Credentials" > "Service account"
3. Name it "nikoniko-bot"
4. No need to grant project roles — click Done
5. Click the service account, go to the "Keys" tab
6. Click "Add Key" > "Create new key" > JSON
7. Save the downloaded JSON — this is your `GOOGLE_SERVICE_ACCOUNT_KEY`

## 3. Create the Spreadsheet

Create a Google Sheet with these column headers in row 1:

| A    | B    | C       |
|------|------|---------|
| Date | Mood | Comment |

## 4. Share with Service Account

1. Open the spreadsheet
2. Click "Share"
3. Paste the service account's `client_email` (from the JSON key file)
4. Give it "Editor" access

## 5. Get the Spreadsheet ID

The spreadsheet URL looks like: `https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit`

The `SPREADSHEET_ID` part is your `GOOGLE_SPREADSHEET_ID` env var.

## 6. Set Environment Variables

```
GOOGLE_SERVICE_ACCOUNT_KEY=<paste entire JSON key file content on one line>
GOOGLE_SPREADSHEET_ID=<your spreadsheet ID>
```
