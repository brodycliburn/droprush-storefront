/**
 * Validates the API's deployment environment without starting the server or
 * connecting to Stripe. Run with NODE_ENV=production and the production env
 * loaded (for example via the host's environment or .env.production).
 */
import { assertConfig, config, deploymentSummary } from '../server/config.mjs'

try {
  assertConfig()
  console.log(JSON.stringify(deploymentSummary(), null, 2))
  if (!config.production) {
    console.log('\nThis was checked in development mode. Set NODE_ENV=production for the deployment check.')
  }
  if (config.webhookUrl) {
    console.log(`\nStripe webhook URL: ${config.webhookUrl}`)
    console.log('Stripe events: checkout.session.completed, checkout.session.async_payment_succeeded,')
    console.log('               checkout.session.async_payment_failed, checkout.session.expired')
  } else {
    console.log('\nPUBLIC_API_URL (or PUBLIC_SITE_URL) is needed to print the exact Stripe webhook URL.')
  }
} catch (error) {
  console.error(error.message)
  process.exit(1)
}
