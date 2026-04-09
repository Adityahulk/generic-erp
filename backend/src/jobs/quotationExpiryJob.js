const { Queue, Worker } = require('bullmq');
const redis = require('../config/redis');
const { query } = require('../config/db');

const QUEUE_NAME = 'quotation-expiry';

const quotationExpiryQueue = new Queue(QUEUE_NAME, { connection: redis });

async function expireStaleQuotations() {
  const r = await query(
    `UPDATE quotations SET status = 'expired', updated_at = NOW()
     WHERE is_deleted = FALSE
       AND status IN ('draft', 'sent')
       AND valid_until_date IS NOT NULL
       AND valid_until_date < CURRENT_DATE`,
  );
  return { expired: r.rowCount || 0 };
}

async function scheduleQuotationExpiryJob() {
  const existing = await quotationExpiryQueue.getRepeatableJobs();
  for (const job of existing) {
    await quotationExpiryQueue.removeRepeatableByKey(job.key);
  }

  await quotationExpiryQueue.add(
    'daily-quotation-expiry',
    {},
    {
      repeat: { pattern: '0 30 3 * * *' },
      removeOnComplete: { count: 30 },
      removeOnFail: { count: 50 },
    },
  );

  console.log('[QuotationExpiryJob] Scheduled daily at 9:00 AM IST (same slot as insurance reminder worker)');
}

function createQuotationExpiryWorker() {
  const worker = new Worker(
    QUEUE_NAME,
    async () => {
      console.log('[QuotationExpiryJob] Running expiry update...');
      const result = await expireStaleQuotations();
      console.log(`[QuotationExpiryJob] Marked ${result.expired} quotations as expired`);
      return result;
    },
    { connection: redis },
  );

  worker.on('failed', (job, err) => {
    console.error('[QuotationExpiryJob] Failed:', err.message);
  });

  return worker;
}

const quotationExpiryWorker = process.env.NODE_ENV !== 'production' ? createQuotationExpiryWorker() : null;

module.exports = {
  quotationExpiryQueue,
  quotationExpiryWorker,
  scheduleQuotationExpiryJob,
  createQuotationExpiryWorker,
  expireStaleQuotations,
};
