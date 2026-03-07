# Notion Database Setup

## 1. Create a Notion Integration

1. Go to https://www.notion.so/my-integrations
2. Click "New integration"
3. Name it "NikoNiko Bot"
4. Select the workspace
5. Copy the "Internal Integration Token" — this is your `NOTION_API_KEY`

## 2. Create the Database

Create a new database in Notion with these properties:

| Property Name | Type       | Configuration                                                 |
| ------------- | ---------- | ------------------------------------------------------------- |
| Date          | Date       | Default                                                       |
| Mood          | Select     | Options: Awesome Day, Good Day, Not So Good Day, Horrible Day |
| Comment       | Text       | Default                                                       |

## 3. Share with Integration

1. Open the database page
2. Click "..." menu > "Connections" > "Connect to" > Select "NikoNiko Bot"

## 4. Get Database ID

1. Open the database as a full page
2. The URL will look like: `https://www.notion.so/yourworkspace/abc123def456?v=...`
3. The `abc123def456` part is your `NOTION_DATABASE_ID`
