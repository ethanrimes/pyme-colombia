# Deployment

## Private web preview on Sites

The repository contains the logical D1 binding and project ID in `.openai/hosting.json`. Sites owns the database and resource binding. Only set `TRUST_SITES_IDENTITY=true` when the trusted Sites dispatcher is the sole ingress: the app then accepts the authenticated identity headers it supplies. Every owner has separate demonstration/live organizations; sign-in alone does not grant access to another owner's records.

The preview has owner-only access. A private preview's browser authentication gate prevents direct native-app requests and provider webhook delivery. Test those integrations locally or deploy the standalone endpoint below. Source includes no external business credentials. The integration encryption key is a runtime secret.

## Standalone web + mobile + webhook backend on Cloudflare

This path creates infrastructure in your own Cloudflare account and can receive provider requests without the Sites browser gate. The web shell is public; all business data APIs require an authenticated session or device bearer token. Provider routes require their signatures. Incoming OpenAI identity headers are ignored because `TRUST_SITES_IDENTITY` is false.

1. Authenticate Wrangler and create a D1 database:

   ```sh
   npx wrangler login
   npx wrangler d1 create nexo-erp
   ```

2. Build and generate a local deployment config using the returned database ID:

   ```sh
   npm run build
   NEXO_DATABASE_ID=YOUR_DATABASE_UUID node scripts/standalone-config.mjs
   npx wrangler d1 migrations apply nexo-erp --remote --config .deployment-config.json
   ```

3. Generate and store the bootstrap keys:

   ```sh
   node scripts/generate-admin-key.mjs
   npx wrangler secret put ADMIN_API_TOKEN_HASH --config .deployment-config.json
   npx wrangler secret put INTEGRATION_ENCRYPTION_KEY --config .deployment-config.json
   ```

   Save the displayed **admin access key** in a password manager, and paste only its SHA-256 hash into `ADMIN_API_TOKEN_HASH`. The encryption key is the separate 32-byte base64 value. Keep `ADMIN_ORG_ID` stable; the generated config uses `nexo-business`. Never put these values in Git.

4. Deploy:

   ```sh
   npx wrangler deploy --config .deployment-config.json
   ```

5. Open the deployed URL and choose **Conectar con clave**. Enter the admin access key. Abastelo creates an empty business on first authenticated access. The web session uses an HttpOnly, SameSite=Strict cookie lasting eight hours. Authorize phones from **Configuración**, then configure provider webhooks against this same HTTPS origin.

The standalone bootstrap admin key selects one organization. The demo/live selector cannot change the organization attached to an API/device key. Rotate the admin key by replacing its hash. Device keys can be individually revoked. Take care to back up the encryption key before rotating it: existing encrypted integration configurations require the old key until re-encrypted.

Before a broader staff rollout, add role-based memberships and access scopes, rate limits, backup/restore drills, monitoring, historical pagination, and your chosen accounting/fiscal controls. This implementation provides an owner role and authorized operational devices, not a complete employee permissions product.

## Native builds

Expo SDK 55 supports the installed Xcode 26.1 toolchain; SDK 56+ requires newer Xcode. [Expo SDK 55 release notes](https://expo.dev/changelog/sdk-55).

```sh
cd apps/mobile
npm ci
npm run typecheck
npm run export:native
# Local generated projects and device/simulator builds
npm run ios
npm run android
```

For store builds, create an Expo account/project, set the public HTTPS API URL (no secret) as `EXPO_PUBLIC_API_URL`, and configure signing:

```sh
npx eas-cli login
npx eas-cli build:configure
npx eas-cli build --platform ios --profile production
npx eas-cli build --platform android --profile production
```

The included `eas.json` defines iOS simulator previews and Android APK previews. Production Android outputs AAB. The identifiers default to `com.ethanrimes.nexo`; update both app identifiers before registering different store listings. Developer accounts, real-device testing, privacy declarations, camera permission review and store submission remain the owner's distribution steps. The repository does not contain signing material or claim App Store / Play Store publication.
