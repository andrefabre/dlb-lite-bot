# Lite Digital Legacy Vault (DLV) Mini App

This is a lite version of the Digital Legacy Vault as a Telegram Mini App. It allows users to store and retrieve non-sensitive asset information securely using client-side AES-256 encryption, biometrics for access, and Telegram's SecureStorage.

## Features
- Onboarding with biometric setup
- Add, view, and delete asset information (type, details, notes)
- Client-side encryption before storage
- Biometric authentication for access
- Theme adaptation to Telegram
- Server-side initData validation for security

## Prerequisites
- Node.js installed
- Telegram account
- Bot token from @BotFather
- Vercel account for deployment

## Setup Instructions

### 1. Create Telegram Bot
- Message @BotFather: `/newbot`
- Follow prompts to create @AssetVaultBot
- Enable Mini App: `/mybots` > select bot > Bot Settings > Configure Mini App > Enable and set URL (after deployment)

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Bot Token
- In `api/validate.js`, replace `'YOUR_BOT_TOKEN'` with your actual bot token.

### 4. Run Locally
```bash
npm start
```
- Runs on localhost:3000
- Full features require Telegram app for biometrics and SecureStorage.

### 5. Deploy to Vercel
- Push code to GitHub
- Connect repo to Vercel
- Deploy (Vercel auto-detects React and API)
- Update BotFather with the Vercel URL

### 6. Test
- Launch via `t.me/AssetVaultBot?startapp` in Telegram app
- Test biometrics, add assets, etc.

## Security Notes
- Do not store sensitive data like passwords or seed phrases
- Client-side encryption with biometric token as key
- Server-side validation prevents tampering
- Consult legal for production use

## Project Structure
- `src/App.js`: Main app component
- `api/validate.js`: Backend validation endpoint
- `public/index.html`: HTML with Telegram SDK
- `vercel.json`: Deployment config
