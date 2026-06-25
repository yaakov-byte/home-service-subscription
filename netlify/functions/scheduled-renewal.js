const { getSupabase } = require('./lib/supabase');
const { schedule } = require('@netlify/functions');

// Daily renewal job. Charges members whose annual term is due.
//
// COMPLIANCE NOTE — READ BEFORE GOING LIVE:
// This is the correct place to send an ADVANCE RENEWAL NOTICE. Connecticut's
// automatic-renewal statute and the FTC negative-option rule may require
// notifying a member BEFORE charging an annual auto-renewal. No notice is
// sent today. Resolve the notice/consent question before real renewals run.
// (See the reminder hook marked TODO below.)

const runRenewals = async () => {
  const supabase = getSupabase();
  const spreedly_env = process.env.SPREEDLY_ENVIRONMENT_KEY;
  const spreedly_secret = process.env.SPREEDLY_ACCESS_SECRET;
  const gateway_token = process.env.SPREEDLY_GATEWAY_TOKEN;
  const authString = Buffer.from(`${spreedly_env}:${spreedly_secret}`).toString('base64');

  // TODO (compliance): before the block below, query members whose
  // next_renewal_date is ~30 days out and send a renewal reminder.

  const { data: members, error } = await supabase
    .from('members')
    .select('*')
    .in('status', ['active', 'payment_failed'])
    .lte('next_renewal_date', new Date().toISOString())
    .lt('failure_count', 3);

  if (error) {
    console.error('Renewal query failed:', error);
    return { statusCode: 500, body: 'Query failed' };
  }
  if (!members || members.length === 0) {
    return { statusCode: 200, body: 'No renewals due' };
  }

  const results = [];
  for (const member of members) {
    try {
      const res = await fetch(`https://core.spreedly.com/v1/gateways/${gateway_token}/purchase.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${authString}` },
        body: JSON.stringify({
          transaction: {
            payment_method_token: member.payment_method_token,
            amount: 9900,
            currency_code: 'USD',
            retain_on_success: true,
            description: 'Home Service Subscription - Annual Renewal',
            email: member.email
          }
        })
      });
      const body = await res.json().catch(() => ({}));
      const txn = body.transaction;

      if (txn && txn.succeeded) {
        const nextRenewal = new Date(member.next_renewal_date);
        nextRenewal.setFullYear(nextRenewal.getFullYear() + 1);
        await supabase.from('members').update({
          next_renewal_date: nextRenewal.toISOString(),
          status: 'active',
          failure_count: 0,
          last_failure_reason: null,
          updated_at: new Date().toISOString()
        }).eq('id', member.id);
        results.push({ email: member.email, success: true });
      } else {
        const fc = (member.failure_count || 0) + 1;
        await supabase.from('members').update({
          failure_count: fc,
          last_failure_reason: txn?.message || 'Unknown',
          status: fc >= 3 ? 'payment_failed' : member.status,
          updated_at: new Date().toISOString()
        }).eq('id', member.id);
        results.push({ email: member.email, success: false, reason: txn?.message || 'Declined' });
      }
    } catch (err) {
      // One member's failure must not abort the rest of the batch.
      console.error(`Renewal error for ${member.email}:`, err);
      results.push({ email: member.email, success: false, reason: 'Exception' });
    }
  }

  console.log('Renewal run complete:', JSON.stringify(results));
  return { statusCode: 200, body: JSON.stringify({ processed: results.length, results }) };
};

// 11:00 UTC daily = 6:00 AM EST (7:00 AM during EDT; Netlify cron is UTC, no DST shift).
module.exports.handler = schedule('0 11 * * *', runRenewals);
