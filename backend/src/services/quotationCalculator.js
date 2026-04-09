const { isInterstate, calculateGst } = require('./gstService');

/**
 * @typedef {Object} LineInput
 * @property {string} item_type
 * @property {string} description
 * @property {string} [hsn_code]
 * @property {number} [quantity]
 * @property {number} unit_price - paise
 * @property {'flat'|'percent'|'none'} [discount_type]
 * @property {number} [discount_value] - paise if flat; if percent, percent×100 (1050 = 10.50%)
 * @property {number} [gst_rate] - total GST % (e.g. 18)
 */

/**
 * @param {LineInput[]} lines
 * @param {boolean} interstate
 * @param {'flat'|'percent'} headerDiscountType
 * @param {number} headerDiscountValue - paise or percent×100
 */
function computeQuotationTotals(lines, interstate, headerDiscountType, headerDiscountValue) {
  const processed = [];
  let sumLineTaxable = 0;
  let sumCgst = 0;
  let sumSgst = 0;
  let sumIgst = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const L = lines[i];
    const qty = Number(L.quantity) || 1;
    const unitPaise = Number(L.unit_price) || 0;
    const gross = unitPaise * qty;

    const dt = L.discount_type || 'none';
    let lineDiscAmt = 0;
    if (dt === 'flat') {
      lineDiscAmt = Math.min(Number(L.discount_value) || 0, gross);
    } else if (dt === 'percent') {
      const dv = Number(L.discount_value) || 0;
      lineDiscAmt = Math.round((gross * dv) / 10000);
      lineDiscAmt = Math.min(lineDiscAmt, gross);
    }

    const taxable = Math.max(0, gross - lineDiscAmt);
    const gstRate = Number(L.gst_rate);
    const rate = Number.isFinite(gstRate) && gstRate >= 0 ? gstRate : 0;
    const gst = calculateGst(taxable, rate, interstate);
    const amount = taxable + gst.cgst_amount + gst.sgst_amount + gst.igst_amount;

    sumLineTaxable += taxable;
    sumCgst += gst.cgst_amount;
    sumSgst += gst.sgst_amount;
    sumIgst += gst.igst_amount;

    processed.push({
      item_type: L.item_type || 'other',
      description: L.description,
      hsn_code: L.hsn_code || null,
      quantity: qty,
      unit_price: unitPaise,
      discount_type: dt,
      discount_value: Number(L.discount_value) || 0,
      discount_amount: lineDiscAmt,
      cgst_rate: gst.cgst_rate,
      sgst_rate: gst.sgst_rate,
      igst_rate: gst.igst_rate,
      cgst_amount: gst.cgst_amount,
      sgst_amount: gst.sgst_amount,
      igst_amount: gst.igst_amount,
      amount,
      sort_order: L.sort_order !== undefined ? L.sort_order : i,
    });
  }

  let headerDiscAmt = 0;
  if (headerDiscountType === 'flat') {
    headerDiscAmt = Math.min(Number(headerDiscountValue) || 0, sumLineTaxable);
  } else if (headerDiscountType === 'percent') {
    const dv = Number(headerDiscountValue) || 0;
    headerDiscAmt = Math.round((sumLineTaxable * dv) / 10000);
    headerDiscAmt = Math.min(headerDiscAmt, sumLineTaxable);
  }

  const taxableAfter = Math.max(0, sumLineTaxable - headerDiscAmt);
  const ratio = sumLineTaxable > 0 ? taxableAfter / sumLineTaxable : 0;

  const cgst = Math.round(sumCgst * ratio);
  const sgst = Math.round(sumSgst * ratio);
  const igst = Math.round(sumIgst * ratio);
  const total = taxableAfter + cgst + sgst + igst;

  return {
    lines: processed,
    subtotal: sumLineTaxable,
    discount_amount: headerDiscAmt,
    cgst_amount: cgst,
    sgst_amount: sgst,
    igst_amount: igst,
    total,
  };
}

function resolveInterstate(companyGstin, customerGstin) {
  return isInterstate(companyGstin || null, customerGstin || null);
}

module.exports = {
  computeQuotationTotals,
  resolveInterstate,
};
