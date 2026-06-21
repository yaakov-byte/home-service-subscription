// ═══════════════════════════════════════════════════════════════
// netlify/functions/process-payment.js
//
// Flow:
// 1. Frontend tokenizes card via Spreedly iFrame → payment_method_token
// 2. This function receives the token
// 3. Calls Spreedly API to run a purchase through the Stripe gateway
// 4. Returns success/failure to the frontend
//
// Environment variables required in Netlify dashboard:
//   SPREEDLY_ACCESS_SECRET  — Your Spreedly API secret
//   SPREEDLY_ENVIRONMENT_KEY — Your Spreedly environment key
//   SPREEDLY_GATEWAY_TOKEN  — The gateway token for your Stripe connection in Spreedly
// ═══════════════════════════════════════════════════════════════

exports.handler = async function (event) {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  try {
    const {
      payment_method_token,
      email,
      phone,
      first_name,
      last_name
    } = JSON.parse(event.body);

    if (!payment_method_token) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'Missing payment token.' })
      };
    }

    // ───────────────────────────────────────
    // Step 1: Charge via Spreedly → Stripe
    // ───────────────────────────────────────
    const spreedly_env = process.env.SPREEDLY_ENVIRONMENT_KEY;
    const spreedly_secret = process.env.SPREEDLY_ACCESS_SECRET;
    const gateway_token = process.env.SPREEDLY_GATEWAY_TOKEN;

    const authString = Buffer.from(`${spreedly_env}:${spreedly_secret}`).toString('base64');

    const purchasePayload = {
      transaction: {
        payment_method_token: payment_method_token,
        amount: 9900,           // $99.00 in cents
        currency_code: 'USD',
        retain_on_success: true, // Keep the card in Spreedly vault for future annual charges
        description: 'Home Service Subscription — Annual Membership',
        email: email,
        metadata: {
          customer_name: `${first_name} ${last_name}`,
          customer_phone: phone,
          customer_email: email,
          product: 'annual_membership',
          entity: 'YY Business Solutions LLC'
        }
      }
    };

    const spreedly_response = await fetch(
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

    const spreedly_result = await spreedly_response.json();
    const txn = spreedly_result.transaction;

    if (txn && txn.succeeded) {
      // ───────────────────────────────────────
      // Step 2: Log successful enrollment
      // In production, store this in your database:
      //   - txn.token (Spreedly transaction ID)
      //   - payment_method_token (for future annual charges)
      //   - Customer info
      //   - Enrollment date
      //   - Next billing date (today + 1 year)
      // ───────────────────────────────────────

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          transaction_id: txn.token,
          message: 'Enrollment successful'
        })
      };
    } else {
      // Transaction failed
      const error_msg = txn?.message || 'Payment was declined. Please check your card details.';

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: false,
          error: error_msg
        })
      };
    }

  } catch (err) {
    console.error('Payment processing error:', err);

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'An internal error occurred. Please try again.'
      })
    };
  }
};
