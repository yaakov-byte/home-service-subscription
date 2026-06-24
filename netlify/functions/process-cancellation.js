const { getSupabase } = require('./lib/supabase');

exports.handler = async function (event) {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Content-Type': 'application/json' };
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
    try {
          const { email } = JSON.parse(event.body);
          if (!email) return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'Email is required.' }) };
          const supabase = getSupabase();
          const { data: member, error: queryError } = await supabase.from('members').select('*').eq('email', email.toLowerCase()).eq('status', 'active').single();
          if (queryError || !member) return { statusCode: 404, headers, body: JSON.stringify({ success: false, error: 'No active membership found for this email address.' }) };
          const cancelDate = new Date();
          const dataDeletionDate = new Date(cancelDate);
          dataDeletionDate.setFullYear(dataDeletionDate.getFullYear() + 2);
          const { error: updateError } = await supabase.from('members').update({ status: 'canceled', cancel_date: cancelDate.toISOString(), data_deletion_date: dataDeletionDate.toISOString(), updated_at: new Date().toISOString() }).eq('id', member.id);
          if (updateError) return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: 'Failed to process cancellation.' }) };
          const enrollDate = new Date(member.enrollment_date);
          const daysSinceEnrollment = Math.floor((Date.now() - enrollDate.getTime()) / (1000 * 60 * 60 * 24));
          const refundEligible = daysSinceEnrollment <= 30;
          return { statusCode: 200, headers, body: JSON.stringify({ success: true, message: 'Your membership has been canceled.', refund_eligible: refundEligible, refund_note: refundEligible ? 'You are within the 30-day refund window. Contact support@yybusinesssolutions.com for a refund.' : 'Your membership will not be charged again.' }) };
    } catch (err) {
          console.error('Cancellation error:', err);
          return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: 'An internal error occurred.' }) };
    }
};
