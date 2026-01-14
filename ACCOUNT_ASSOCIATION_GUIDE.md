# How to Fill accountAssociation in farcaster.json

## What is accountAssociation?

The `accountAssociation` object cryptographically verifies that you own the domain and associates your Mini App with your Farcaster account. This is **optional** but recommended for:
- Getting credit for your app
- Eligibility for Warpcast Developer Rewards
- User trust (verified author badge)

## How to Generate accountAssociation

### Step 1: Use the Farcaster Mini App Manifest Tool

1. **Open Warpcast** (the Farcaster client)
2. **Go to**: Settings → Developer → Mini App Manifest Tool
   - Or visit: https://farcaster.xyz/~/developers/mini-apps/manifest
3. **Enter your domain**: `reader-mini-app.vercel.app`
   - ⚠️ **Important**: The domain must match EXACTLY where your manifest is hosted
   - No `https://` prefix, just the domain
4. **Sign the message** with your Farcaster account
5. **Copy the generated JSON** - it will look like this:

```json
{
  "header": "eyJmaWQiOjkxNTIsInR5cGUiOiJjdXN0b2R5Iiwia2V5IjoiMHgwMmVmNzkwRGQ3OTkzQTM1ZkQ4NDdDMDUzRURkQUU5NDBEMDU1NTk2In0",
  "payload": "eyJkb21haW4iOiJyZWFkZXItbWluaS1hcHAudmVyY2VsLmFwcCJ9",
  "signature": "0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b"
}
```

### Step 2: Update farcaster.json

Replace the empty strings in your `farcaster.json` with the values from the tool:

```json
{
  "accountAssociation": {
    "header": "eyJmaWQiOjkxNTIsInR5cGUiOiJjdXN0b2R5Iiwia2V5IjoiMHgwMmVmNzkwRGQ3OTkzQTM1ZkQ4NDdDMDUzRURkQUU5NDBEMDU1NTk2In0",
    "payload": "eyJkb21haW4iOiJyZWFkZXItbWluaS1hcHAudmVyY2VsLmFwcCJ9",
    "signature": "0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b"
  },
  "miniapp": {
    ...
  }
}
```

## Format Requirements

- **header**: Base64url-encoded JSON string (contains FID, type, and key info)
- **payload**: Base64url-encoded JSON string (contains the domain)
- **signature**: Hex string starting with `0x` (cryptographic signature)

## Important Notes

1. **Domain must match exactly**: The domain in the payload must match where you host `/.well-known/farcaster.json`
2. **One account per domain**: Each domain can only be associated with one Farcaster account
3. **Can't change later**: Once set, you can't change the account association (but you can migrate domains)
4. **Optional**: You can deploy without `accountAssociation`, but you won't be verified

## Current Status

Your `accountAssociation` is currently empty. You need to:
1. Generate it using the Warpcast tool
2. Fill in the three fields
3. Commit and push
4. Deploy to Vercel

Once deployed, Farcaster will verify the association automatically.
