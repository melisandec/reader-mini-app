# Farcaster Manifest Fixes

## Issues Found and Fixed

### ✅ Fixed Issues:

1. **Wrong property name**: Changed from `"frame"` to `"miniapp"` (frame is deprecated, miniapp is current standard)

2. **Deprecated properties removed**:
   - `imageUrl` - deprecated (replaced by `ogImageUrl`)
   - `buttonTitle` - deprecated

3. **Non-standard property removed**:
   - `castShareUrl` - not a standard Farcaster Mini App property

4. **Missing required property added**:
   - `canonicalDomain` - added "reader-mini-app.vercel.app"

5. **Wrong file location**: 
   - Deleted `manifest.json` (wrong file)
   - Updated `farcaster.json` (correct file at `/.well-known/farcaster.json`)

6. **Removed webhookUrl**: 
   - Removed since it's only needed if using notifications (which we're not currently)

### ✅ Validated Properties:

- **version**: "1" ✅
- **name**: "READER" (6 chars, max 32) ✅
- **homeUrl**: Present ✅
- **iconUrl**: Present ✅
- **splashImageUrl**: Present ✅
- **splashBackgroundColor**: "#FFFFFF" ✅
- **subtitle**: "Daily reading tracker" (22 chars, max 30, no emojis) ✅
- **description**: 109 chars, max 170, no emojis ✅
- **primaryCategory**: "productivity" (valid category) ✅
- **tags**: All lowercase, no spaces, no special chars ✅
- **tagline**: "Turn reading into a daily win" (30 chars, max 30) ✅
- **ogTitle**: "READER Track Your Reading" (26 chars, max 30) ✅
- **ogDescription**: 71 chars, max 100 ✅
- **ogImageUrl**: Present ✅
- **canonicalDomain**: "reader-mini-app.vercel.app" ✅

### 📝 Optional Properties Not Included (but available):

- `accountAssociation` - For verifying ownership (optional, can add later)
- `screenshotUrls` - Up to 3 screenshots (optional)
- `heroImageUrl` - Promotional image (optional)
- `webhookUrl` - Only if using notifications (optional)
- `requiredChains` - Only if app requires specific chains (optional)
- `requiredCapabilities` - Only if app requires specific capabilities (optional)
- `noindex` - To exclude from search (optional, defaults to false)

## Current Status

✅ All required properties are present and valid
✅ All character limits are within bounds
✅ All constraints are met
✅ File is at correct location: `/.well-known/farcaster.json`
✅ Using correct property name: `miniapp` (not `frame`)
