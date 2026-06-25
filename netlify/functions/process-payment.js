const { getSupabase } = require('./lib/supabase');

// Best-effort owner alert. No-op unless ALERT_WEBHOOK_URL is configured.
// Never throws — alerting must not break the customer response.
async function alertOwner(payload) {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  } catch (e) {
    console.error('Alert webhook failed:', e);
  }
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  try {
    const { payment_method_token, email, phone, first_name, last_name } = JSON.parse(event.body);
    if (!payment_method_token) return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'Missing payment token.' }) };
    if (!email || !first_name || !last_name) return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'Missing required customer information.' }) };

    const spreedly_env = process.env.SPREEDLY_ENVIRONMENT_KEY;
    const spreedly_secret = process.env.SPREEDLY_ACCESS_SECRET;
    const gateway_token = process.env.SPREEDLY_GATEWAY_TOKEN;
    const authString = Buffer.from(`${spreedly_env}:${spreedly_secret}`).toString('base64');

    const purchasePayload = {
      transaction: {
        payment_method_token,
        amount: 9900,
        currency_code: 'USD',
        retain_on_success: true,
        description: 'Home Service Subscription - Annual Membership',
        email,
        metadata: { customer_name: `${first_name} ${last_name}`, customer_phone: phone, customer_email: email, product: 'annual_membership', entity: 'YY Business Solutions LLC' }
      }
    };

    const spreedly_response = await fetch(`https://core.spreedly.com/v1/gateways/${gateway_token}/purchase.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${authString}` },
      body: JSON.stringify(purchasePayload)
    });
    const spreedly_result = await spreedly_response.json();
    const txn = spreedly_result.transaction;

    if (txn && txn.succeeded) {
      const supabase = getSupabase();
      const now = new Date();
      const nextRenewal = new Date(now);
      nextRenewal.setFullYear(nextRenewal.getFullYear() + 1);
      const { error: dbError } = await supabase.from('members').insert({
        email: email.toLowerCase(), phone: phone || null, first_name, last_name,
        payment_method_token, spreedly_transaction_id: txn.token,
        enrollment_date: now.toISOString(), next_renewal_date: nextRenewal.toISOString(), status: 'active'
      });

      if (dbError) {
        // The card WAS charged but we have no member record. Without this
        // record the customer cannot be renewed or self-cancel, so this must
        // be surfaced loudly and the customer given a path to reconcile.
        console.error('CRITICAL: Payment succeeded but member insert failed.', { transaction_id: txn.token, email, dbError });
        await alertOwner({ type: 'enrollment_record_failure', transaction_id: txn.token, email, name: `${first_name} ${last_name}`, phone: phone || null, error: String(dbError?.message || dbError) });
        return { statusCode: 200, headers, body: JSON.stringify({ success: true, record_warning: true, transaction_id: txn.token, message: 'Your payment went through, but we hit a snag saving your membership. Please email support@yybusinesssolutions.com with confirmation number ' + txn.token + ' so we can finish setting up your account.' }) };
      }

      return { statusCode: 200, headers, body: JSON.stringify({ success: true, transaction_id: txn.token, message: 'Enrollment successful' }) };
    } else {
      const error_msg = txn?.message || 'Payment was declined. Please check your card details.';
      return { statusCode: 200, headers, body: JSON.stringify({ success: false, error: error_msg }) };
    }
  } catch (err) {
    console.error('Payment processing error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: 'An internal error occurred. Please try again.' }) };
  }
};
const { getSupabase } = require('./lib/supabase');

exports.handler = async function (event) {
    if (event.httpMethod !== 'POST') {
          return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
    }
    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Content-Type': 'application/json' };
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
    try {
          const { payment_method_token, email, phone, first_name, last_name } = JSON.parse(event.body);
          if (!payment_method_token) return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'Missing payment token.' }) };
          if (!email || !first_name || !last_name) return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'Missing required customer information.' }) };
          const spreedly_env = process.env.SPREEDLY_ENVIRONMENT_KEY;
          const spreedly_secret = process.env.SPREEDLY_ACCESS_SECRET;
          const gateway_token = process.env.SPREEDLY_GATEWAY_TOKEN;
          const authString = Buffer.from(`${spreedly_env}:${spreedly_secret}`).toString('base64');
          const purchasePayload = {
                  transaction: {
                            payment_method_token,
                            amount: 9900,
                            currency_code: 'USD',
                            retain_on_success: true,
                            description: 'Home Service Subscription - Annual Membership',
                            email,
                            metadata: { customer_name: `${first_name} ${last_name}`, customer_phone: phone, customer_email: email, product: 'annual_membership', entity: 'YY Business Solutions LLC' }
                  }
          };
          const spreedly_response = await fetch(`https://core.spreedly.com/v1/gateways/${gateway_token}/purchase.json`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${authString}` },
                  body: JSON.stringify(purchasePayload)
          });
          const spreedly_result = await spreedly_response.json();
          const txn = spreedly_result.transaction;
          if (txn && txn.succeeded) {
                  const supabase = getSupabase();
                  const now = new Date();
                  const nextRenewal = new Date(now);
                  nextRenewal.setFullYear(nextRenewal.getFullYear() + 1);
                  const { error: dbError } = await supabase.from('members').insert({
                            email: email.toLowerCase(), phone: phone || null, first_name, last_name,
                            payment_method_token, spreedly_transaction_id: txn.token,
                            enrollment_date: now.toISOString(), next_renewal_date: nextRenewal.toISOString(), status: 'active'
                  });
                  if (dbError) console.error('CRITICAL: Payment succeeded but failed to save member:', dbError);
                  return { statusCode: 200, headers, body: JSON.stringify({ success: true, transaction_id: txn.token, message: 'Enrollment successful' }) };
          } else {
                  const error_msg = txn?.message || 'Payment was declined. Please check your card details.';
                  return { statusCode: 200, headers, body: JSON.stringify({ success: false, error: error_msg }) };
          }
    } catch (err) {
          console.error('Payment processing error:', err);
          return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: 'An internal error occurred. Please try again.' }) };
    }
};
