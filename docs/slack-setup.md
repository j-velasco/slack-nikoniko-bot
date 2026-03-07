# Slack App Setup

## 1. Create the Slack App

1. Go to https://api.slack.com/apps
2. Click "Create New App" > "From scratch"
3. Name it "NikoNiko" and select your workspace

## 2. Configure Slash Command

1. Go to "Slash Commands" in the sidebar
2. Click "Create New Command"
   - Command: `/mood`
   - Request URL: `https://your-railway-url.up.railway.app/slack/events`
   - Description: "Share your daily mood anonymously"

## 3. Enable Interactivity

1. Go to "Interactivity & Shortcuts"
2. Toggle ON
3. Request URL: `https://your-railway-url.up.railway.app/slack/events`

## 4. Set Bot Scopes

Go to "OAuth & Permissions" and add these Bot Token Scopes:
- `commands`
- `chat:write`

## 5. Install to Workspace

1. Go to "Install App"
2. Click "Install to Workspace"
3. Copy the "Bot User OAuth Token" — this is your `SLACK_BOT_TOKEN`

## 6. Get Signing Secret

1. Go to "Basic Information"
2. Under "App Credentials", copy "Signing Secret" — this is your `SLACK_SIGNING_SECRET`
