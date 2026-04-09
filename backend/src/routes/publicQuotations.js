const { Router } = require('express');
const redis = require('../config/redis');
const { buildQuotationHtml, loadQuotationBundle } = require('../controllers/quotationsController');

const SHARE_PREFIX = 'quotation:share:';

const router = Router();

router.get('/quotations/:token', async (req, res) => {
  try {
    const raw = await redis.get(`${SHARE_PREFIX}${req.params.token}`);
    if (!raw) {
      return res.status(404).type('html')
        .send('<!DOCTYPE html><html><body><p>This link has expired or is invalid.</p></body></html>');
    }
    const { quotationId, companyId } = JSON.parse(raw);
    const bundle = await loadQuotationBundle(quotationId, companyId);
    if (!bundle || bundle.quotation.is_deleted) {
      return res.status(404).type('html')
        .send('<!DOCTYPE html><html><body><p>Quotation not found.</p></body></html>');
    }
    const html = buildQuotationHtml(bundle);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    console.error('public quotation view:', err);
    res.status(500).type('html')
      .send('<!DOCTYPE html><html><body><p>Unable to load quotation.</p></body></html>');
  }
});

module.exports = router;
