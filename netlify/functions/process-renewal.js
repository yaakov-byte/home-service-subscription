const { getSupabase } = require('./lib/supabase');

exports.handler = async function (event) {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
    const headers = { 'Content-Type': 'application/json' };
    try {
          const { auth_key, member_email } = JSON.parse(event.body);
          if (auth_key !== process.env.RENEWAL_AUTH_KEY) return { statusCode: 401, headers, body: JSON.stringify({ success: false, error: 'Unauthorized' }) };
          const supabase = getSupabase();
          const spreedly_env = process.env.SPREEDLY_ENVIRONMENT_KEY;
          const spreedly_secret = process.env.SPREEDLY_ACCESS_SECRET;
          const gateway_token = process.env.SPREEDLY_GATEWAY_TOKEN;
          const authString = Buffer.from(`${spreedly_env}:${spreedly_secret}`).toString('base64');
          let query = supabase.from('members').select('*').in('status', ['active', 'payment_failed']);
          if (member_email) { query = query.eq('email', member_email.toLowerCase()); }
          else { query = query.lte('next_renewal_date', new Date().toISOString()).lt('failure_count', 3); }
          const { data: members, error: queryError } = await query;
          if (queryError) return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: 'Database query failed.' }) };
          if (!members || members.length === 0) return { statusCode: 200, headers, body: JSON.stringify({ success: true, message: 'No members found to process.' }) };
          const results = [];
          for (const member of members) {
                  const res = await fetch(`https://core.spreedly.com/v1/gateways/${gateway_token}/purchase.json`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${authString}` }, body: JSON.stringify({ transaction: { payment_method_token: member.payment_method_token, amount: 9900, currency_code: 'USD', retain_on_success: true, description: 'Home Service Subscription - Annual Renewal', email: member.email } }) });
                  const txn = (await res.json()).transaction;
                  if (txn && txn.succeeded) {
                            const nextRenewal = new Date(member.next_renewal_date);
                            nextRenewal.setFullYear(nextRenewal.getFullYear() + 1);
                            await supabase.from('members').update({ next_renewal_date: nextRenewal.toISOString(), status: 'active', failure_count: 0, last_failure_reason: null, updated_at: new Date().toISOString() }).eq('id', member.id);
                            results.push({ email: member.email, success: true, transaction_id: txn.token });
                  } else {
                            const fc = (member.failure_count || 0) + 1;
                            await supabase.from('members').update({ failure_count: fc, last_failure_reason: txn?.message || 'Unknown', status: fc >= 3 ? 'payment_failed' : member.status, updated_at: new Date().toISOString() }).eq('id', member.id);
                            results.push({ email: member.email, success: false, error: txn?.message || 'Declined' });
                  }
          }
          return { statusCode: 200, headers, body: JSON.stringify({ success: true, results }) };
    } catch (err) {
          return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: 'Internal error.' }) };
    }
};
