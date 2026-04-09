/** Mirror backend quotationCalculator for UI (intrastate unless customer GSTIN differs from company — simplified: pass interstate boolean). */

function calculateGst(taxableAmount, gstRate, interstate) {
  const rate = Number(gstRate) || 0;
  if (interstate) {
    const igstAmount = Math.round((taxableAmount * rate) / 100);
    return {
      cgst_rate: 0,
      sgst_rate: 0,
      igst_rate: rate,
      cgst_amount: 0,
      sgst_amount: 0,
      igst_amount: igstAmount,
    };
  }
  const half = rate / 2;
  const cgstAmount = Math.round((taxableAmount * half) / 100);
  const sgstAmount = Math.round((taxableAmount * half) / 100);
  return {
    cgst_rate: half,
    sgst_rate: half,
    igst_rate: 0,
    cgst_amount: cgstAmount,
    sgst_amount: sgstAmount,
    igst_amount: 0,
  };
}

export function computeQuotationTotals(lines, interstate, headerDiscountType, headerDiscountValue) {
  let sumLineTaxable = 0;
  let sumCgst = 0;
  let sumSgst = 0;
  let sumIgst = 0;

  for (const L of lines) {
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
    const gst = calculateGst(taxable, Number(L.gst_rate) || 0, interstate);
    sumLineTaxable += taxable;
    sumCgst += gst.cgst_amount;
    sumSgst += gst.sgst_amount;
    sumIgst += gst.igst_amount;
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
    subtotal: sumLineTaxable,
    discount_amount: headerDiscAmt,
    cgst_amount: cgst,
    sgst_amount: sgst,
    igst_amount: igst,
    total,
  };
}

export function gstStateFromGstin(companyGstin, customerGstin) {
  if (!companyGstin || !customerGstin || companyGstin.length < 2 || customerGstin.length < 2) {
    return false;
  }
  return companyGstin.slice(0, 2) !== customerGstin.slice(0, 2);
}
