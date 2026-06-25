const { getSupabase } = require('./lib/supabase');
const nodemailer = require('nodemailer');

// Sends a cancellation notice to billing. Best-effort: never throws, so an
// email problem can't block the customer's cancellation.
async function notifyBilling(customerEmail, dbStatus) {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    console.warn('SMTP not configured; cancellation notice not sent for', customerEmail);
    return;
  }
  try {
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
      connectionTimeout: 10000,
      greetingTimeout: 10000
    });
    await transporter.sendMail({
      from: process.env.SMTP_FROM || user,
      to: process.env.CANCEL_NOTIFY_EMAIL || 'billing@yybusinesssolutions.com',
      subject: 'Membership cancellation request',
      text: 'A customer has requested to cancel their Home Service Subscription membership.\n\n'
        + 'Customer email: ' + customerEmail + '\n'
        + 'Time: ' + new Date().toISOString() + '\n'
        + 'Database status: ' + dbStatus
    });
  } catch (e) {
    console.error('Cancellation notice email failed:', e);
  }
}

exports.handler = async function (event) {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  try {
    const { email } = JSON.parse(event.body);
    if (!email) return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'Email is required.' }) };

    let dbStatus = 'not recorded (database unavailable)';
    let refundEligible = false;

    // Best-effort database cancellation. A database problem must not block the
    // customer's cancellation or the billing notification below.
    try {
      const supabase = getSupabase();
      const { data: member, error: queryError } = await supabase
        .from('members').select('*').eq('email', email.toLowerCase()).eq('status', 'active').single();
      if (!queryError && member) {
        const cancelDate = new Date();
        const dataDeletionDate = new Date(cancelDate);
        dataDeletionDate.setFullYear(dataDeletionDate.getFullYear() + 2);
        await supabase.from('members').update({
          status: 'canceled',
          cancel_date: cancelDate.toISOString(),
          data_deletion_date: dataDeletionDate.toISOString(),
          updated_at: new Date().toISOString()
        }).eq('id', member.id);
        const daysSinceEnrollment = Math.floor((Date.now() - new Date(member.enrollment_date).getTime()) / (1000 * 60 * 60 * 24));
        refundEligible = daysSinceEnrollment <= 30;
        dbStatus = 'canceled in database';
      } else {
        dbStatus = 'no active membership found in database';
      }
    } catch (dbErr) {
      console.error('Supabase cancellation step failed:', dbErr);
      dbStatus = 'database error';
    }

    // Always notify billing with the customer's email address.
    await notifyBilling(email, dbStatus);

    return { statusCode: 200, headers, body: JSON.stringify({
      success: true,
      message: 'Your cancellation request has been received and your membership will not be renewed.',
      refund_eligible: refundEligible,
      refund_note: refundEligible
        ? 'You are within the 30-day refund window. Contact support@yybusinesssolutions.com for a refund.'
        : 'You will not be charged again.'
    }) };
  } catch (err) {
    console.error('Cancellation error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: 'An internal error occurred.' }) };
  }
};
