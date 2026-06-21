// ═══════════════════════════════════════════════════════════════
// netlify/functions/process-renewal.js
//
// Purpose: Charge a stored (retained) payment method for annual renewal.
//
// This function is called by your billing system (cron job, scheduler,
// or manual trigger) when a subscriber's annual renewal date arrives.
//
// The payment_method_token was retained in Spreedly's vault during
// the original enrollment (retain_on_success: true).
//
// Environment variables required:
//   SPREEDLY_ACCESS_SECRET
//   SPREEDLY_ENVIRONMENT_KEY
//   SPREEDLY_GATEWAY_TOKEN
//   RENEWAL_AUTH_KEY — A secret key to prevent unauthorized calls
// ═══════════════════════════════════════════════════════════════

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const headers = {
    'Content-Type': 'application/json'
  };

  try {
    const { payment_method_token, customer_email, customer_name, auth_key } = JSON.parse(event.body);

    // ── Authenticate the request ──
    if (auth_key !== process.env.RENEWAL_AUTH_KEY) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ success: false, error: 'Unauthorized' })
      };
    }

    if (!payment_method_token) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'Missing payment method token.' })
      };
    }

    // ── Charge the retained card ──
    const spreedly_env = process.env.SPREEDLY_ENVIRONMENT_KEY;
    const spreedly_secret = process.env.SPREEDLY_ACCESS_SECRET;
    const gateway_token = process.env.SPREEDLY_GATEWAY_TOKEN;
    const authString = Buffer.from(`${spreedly_env}:${spreedly_secret}`).toString('base64');

    const purchasePayload = {
      transaction: {
        payment_method_token: payment_method_token,
        amount: 9900,
        currency_code: 'USD',
        retain_on_success: true,  // Keep retained for next year
        description: 'Home Service Subscription — Annual Renewal',
        email: customer_email,
        metadata: {
          customer_name: customer_name,
          product: 'annual_membership_renewal',
          entity: 'YY Business Solutions LLC'
        }
      }
    };

    const response = await fetch(
      `https://core.spreedly.com/v1/gateways/${gateway_token}/purchase.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${authString}`
        },
        body: JSON.stringify(purchasePayload)
      }
    );

    const result = await response.json();
    const txn = result.transaction;

    if (txn && txn.succeeded) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          transaction_id: txn.token,
          message: 'Renewal processed successfully'
        })
      };
    } else {
      // Card declined or expired — flag for manual outreach
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: false,
          error: txn?.message || 'Renewal charge declined.',
          requires_outreach: true
        })
      };
    }

  } catch (err) {
    console.error('Renewal processing error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: 'Internal error during renewal.' })
    };
  }
};
