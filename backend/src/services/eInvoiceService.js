/**
 * NIC E-Invoice (IRP) API Integration Service
 *
 * Flow:
 *   1. Authenticate with NIC using RSA-encrypted credentials → get AuthToken + SEK
 *   2. Decrypt SEK using our AppKey (AES-256-ECB)
 *   3. Encrypt invoice JSON with decrypted SEK (AES-256-ECB) → send to Generate IRN API
 *   4. Decrypt response with SEK → get IRN, QR code, signed invoice
 *
 * Environments:
 *   Sandbox:    https://einv-apisandbox.nic.in
 *   Production: https://einvoice1.gst.gov.in
 */

const crypto = require('crypto');
const { query } = require('../config/db');

const SANDBOX_URL = 'https://einv-apisandbox.nic.in';
const PRODUCTION_URL = 'https://einvoice1.gst.gov.in';

// NIC's public key for encrypting auth payload (sandbox — replace with production key)
const NIC_PUBLIC_KEY_SANDBOX = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEArxd93uLDs8HTPqcSPpxZ
rf0Dc29r3iPp0a8filjAyeX4RAH6lWm9qFt26CcE8ESYtmo1sVtswvs7VH4Bjg/F
DlRpd+MnAlXuxChij8/vjyqHncZ1GPJBR1RJAGbVOFJZe2bih3cCJKBVbIcMhJKh
EIW0FNJHiTA+GBYXCBDMIE6qEJnS9FRbcziBMixkdjKTR69Mo5mCvFOFpSFaIkaI
JFASZ1RMiNkRmEGKx7Bvx8ccNLE0Baq+GwSAlBCHinj/jJE0JJkHL4JAhKSHY8Un
cREUIkgpiDBjE5kZj2llJFo5bCEzlN6FzoX/IyuSzlPRNDXsOYCl3v7twEF0cOBw
bQIDAQAB
-----END PUBLIC KEY-----`;

function getConfig() {
  const isProduction = process.env.EINVOICE_ENV === 'production';
  return {
    baseUrl: isProduction ? PRODUCTION_URL : SANDBOX_URL,
    clientId: process.env.EINVOICE_CLIENT_ID || '',
    clientSecret: process.env.EINVOICE_CLIENT_SECRET || '',
    username: process.env.EINVOICE_USERNAME || '',
    password: process.env.EINVOICE_PASSWORD || '',
    gstin: process.env.EINVOICE_GSTIN || '',
    publicKey: isProduction
      ? (process.env.EINVOICE_PUBLIC_KEY || NIC_PUBLIC_KEY_SANDBOX)
      : NIC_PUBLIC_KEY_SANDBOX,
    isProduction,
  };
}

function encryptWithPublicKey(data, publicKey) {
  const buffer = Buffer.from(JSON.stringify(data), 'utf8');
  return crypto.publicEncrypt(
    { key: publicKey, padding: crypto.constants.RSA_PKCS1_v1_5 },
    buffer,
  ).toString('base64');
}

function aesEncrypt(plainText, keyBase64) {
  const key = Buffer.from(keyBase64, 'base64');
  const cipher = crypto.createCipheriv('aes-256-ecb', key, null);
  cipher.setAutoPadding(true);
  let encrypted = cipher.update(plainText, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  return encrypted;
}

function aesDecrypt(encryptedBase64, keyBase64) {
  const key = Buffer.from(keyBase64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-ecb', key, null);
  decipher.setAutoPadding(true);
  let decrypted = decipher.update(encryptedBase64, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * Authenticate with NIC IRP and get AuthToken + SEK.
 * Caches tokens in DB until they expire.
 */
async function authenticate(companyId) {
  const config = getConfig();

  // Check cached token
  const { rows: cached } = await query(
    `SELECT auth_token, sek, token_expiry FROM einvoice_tokens
     WHERE company_id = $1 AND gstin = $2 AND token_expiry > NOW()`,
    [companyId, config.gstin],
  );
  if (cached.length > 0) {
    return { authToken: cached[0].auth_token, sek: cached[0].sek };
  }

  // Generate a random 32-byte AppKey
  const appKeyBytes = crypto.randomBytes(32);
  const appKeyBase64 = appKeyBytes.toString('base64');

  const authPayload = {
    UserName: config.username,
    Password: config.password,
    AppKey: appKeyBase64,
    ForceRefreshAccessToken: false,
  };

  const encryptedPayload = encryptWithPublicKey(authPayload, config.publicKey);

  const response = await fetch(`${config.baseUrl}/eivital/v1.04/auth`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      Gstin: config.gstin,
    },
    body: JSON.stringify({ Data: encryptedPayload }),
  });

  const result = await response.json();

  if (result.Status !== 1 && result.Status !== '1') {
    const errMsg = result.ErrorDetails?.map((e) => e.ErrorMessage).join('; ') || result.ErrorMessage || 'Authentication failed';
    throw new Error(`NIC Auth failed: ${errMsg}`);
  }

  const authToken = result.Data.AuthToken;
  const encryptedSek = result.Data.Sek;

  // Decrypt SEK using our AppKey
  const decryptedSek = aesDecrypt(encryptedSek, appKeyBase64);

  // Cache in DB
  const expiry = result.Data.TokenExpiry || new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString();
  await query(
    `INSERT INTO einvoice_tokens (company_id, gstin, auth_token, sek, token_expiry)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (company_id, gstin)
     DO UPDATE SET auth_token = $3, sek = $4, token_expiry = $5`,
    [companyId, config.gstin, authToken, decryptedSek, expiry],
  );

  return { authToken, sek: decryptedSek };
}

/**
 * Build the NIC e-Invoice JSON payload from our invoice data.
 * Amounts must be in rupees (not paise) with max 2 decimal places.
 */
function buildEInvoicePayload(invoiceData) {
  const { invoice: inv, items } = invoiceData;
  const toRupees = (paise) => Math.round(Number(paise)) / 100;

  const hasIgst = items.some((i) => Number(i.igst_amount) > 0);
  const supTyp = hasIgst ? 'INTRSUP' : 'B2B';

  // Determine document type
  let docTyp = 'INV';
  if (inv.invoice_number?.startsWith('CN-')) docTyp = 'CRN';
  if (inv.invoice_number?.startsWith('DN-')) docTyp = 'DBN';

  const invDate = new Date(inv.invoice_date);
  const formattedDate = `${String(invDate.getDate()).padStart(2, '0')}/${String(invDate.getMonth() + 1).padStart(2, '0')}/${invDate.getFullYear()}`;

  // Extract state codes from GSTINs
  const sellerStateCode = inv.company_gstin ? inv.company_gstin.substring(0, 2) : '30';
  const buyerStateCode = inv.customer_gstin ? inv.customer_gstin.substring(0, 2) : sellerStateCode;

  // Extract PIN from address (last 6 digits if present)
  const extractPin = (address) => {
    if (!address) return 0;
    const match = address.match(/\b(\d{6})\b/);
    return match ? parseInt(match[1], 10) : 0;
  };

  const itemList = items.map((item, idx) => {
    const unitPrice = toRupees(item.unit_price);
    const qty = Number(item.quantity) || 1;
    const totAmt = unitPrice * qty;
    const discount = 0;
    const assAmt = totAmt - discount;
    const cgstAmt = toRupees(item.cgst_amount);
    const sgstAmt = toRupees(item.sgst_amount);
    const igstAmt = toRupees(item.igst_amount);
    const totalItemVal = assAmt + cgstAmt + sgstAmt + igstAmt;

    return {
      SlNo: String(idx + 1),
      PrdDesc: item.description || 'Vehicle',
      IsServc: 'N',
      HsnCd: item.hsn_code || '8703',
      Qty: qty,
      FreeQty: 0,
      Unit: 'NOS',
      UnitPrice: unitPrice,
      TotAmt: totAmt,
      Discount: discount,
      PreTaxVal: 0,
      AssAmt: assAmt,
      GstRt: Number(item.cgst_rate || 0) + Number(item.sgst_rate || 0) + Number(item.igst_rate || 0),
      IgstAmt: igstAmt,
      CgstAmt: cgstAmt,
      SgstAmt: sgstAmt,
      CesRt: 0,
      CesAmt: 0,
      CesNonAdvlAmt: 0,
      StateCesRt: 0,
      StateCesAmt: 0,
      StateCesNonAdvlAmt: 0,
      OthChrg: 0,
      TotItemVal: totalItemVal,
    };
  });

  const totalAssVal = itemList.reduce((s, i) => s + i.AssAmt, 0);
  const totalCgst = itemList.reduce((s, i) => s + i.CgstAmt, 0);
  const totalSgst = itemList.reduce((s, i) => s + i.SgstAmt, 0);
  const totalIgst = itemList.reduce((s, i) => s + i.IgstAmt, 0);
  const discount = toRupees(inv.discount || 0);
  const totalInvVal = totalAssVal + totalCgst + totalSgst + totalIgst - discount;

  return {
    Version: '1.1',
    TranDtls: {
      TaxSch: 'GST',
      SupTyp: supTyp,
      RegRev: 'N',
      EcmGstin: null,
      IgstOnIntra: 'N',
    },
    DocDtls: {
      Typ: docTyp,
      No: inv.invoice_number,
      Dt: formattedDate,
    },
    SellerDtls: {
      Gstin: inv.company_gstin || '',
      LglNm: inv.company_name || '',
      TrdNm: inv.company_name || '',
      Addr1: (inv.company_address || '').substring(0, 100) || 'Address',
      Addr2: '',
      Loc: (inv.company_address || '').split(',').pop()?.trim()?.replace(/\d{6}/, '').trim() || 'City',
      Pin: extractPin(inv.company_address) || 403001,
      Stcd: sellerStateCode,
      Ph: (inv.company_phone || '').replace(/\D/g, '').substring(0, 12) || null,
      Em: inv.company_email || null,
    },
    BuyerDtls: {
      Gstin: inv.customer_gstin || 'URP',
      LglNm: inv.customer_name || '',
      TrdNm: inv.customer_name || '',
      Pos: buyerStateCode,
      Addr1: (inv.customer_address || '').substring(0, 100) || 'Address',
      Addr2: '',
      Loc: (inv.customer_address || '').split(',').pop()?.trim()?.replace(/\d{6}/, '').trim() || 'City',
      Pin: extractPin(inv.customer_address) || 403001,
      Stcd: buyerStateCode,
      Ph: (inv.customer_phone || '').replace(/\D/g, '').substring(0, 12) || null,
      Em: inv.customer_email || null,
    },
    ItemList: itemList,
    ValDtls: {
      AssVal: Math.round(totalAssVal * 100) / 100,
      CgstVal: Math.round(totalCgst * 100) / 100,
      SgstVal: Math.round(totalSgst * 100) / 100,
      IgstVal: Math.round(totalIgst * 100) / 100,
      CesVal: 0,
      StCesVal: 0,
      Discount: Math.round(discount * 100) / 100,
      OthChrg: 0,
      RndOffAmt: 0,
      TotInvVal: Math.round(totalInvVal * 100) / 100,
      TotInvValFc: 0,
    },
  };
}

/**
 * Generate IRN for a confirmed invoice.
 */
async function generateIRN(companyId, invoiceData) {
  const config = getConfig();
  const { authToken, sek } = await authenticate(companyId);

  const payload = buildEInvoicePayload(invoiceData);
  const payloadJson = JSON.stringify(payload);

  // Encrypt payload with SEK
  const encryptedData = aesEncrypt(payloadJson, Buffer.from(sek, 'utf8').toString('base64').substring(0, 44));

  const response = await fetch(`${config.baseUrl}/eicore/v1.03/Invoice`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      Gstin: config.gstin,
      AuthToken: authToken,
      user_name: config.username,
    },
    body: JSON.stringify({ Data: encryptedData }),
  });

  const result = await response.json();

  if (result.Status !== 1 && result.Status !== '1') {
    const errMsg = result.ErrorDetails?.map((e) => `${e.ErrorCode}: ${e.ErrorMessage}`).join('; ')
      || result.ErrorMessage || 'IRN generation failed';
    throw new Error(errMsg);
  }

  // Decrypt response data with SEK
  let responseData;
  try {
    const decrypted = aesDecrypt(result.Data, Buffer.from(sek, 'utf8').toString('base64').substring(0, 44));
    responseData = JSON.parse(decrypted);
  } catch {
    responseData = typeof result.Data === 'object' ? result.Data : {};
  }

  return {
    irn: responseData.Irn,
    ackNumber: responseData.AckNo,
    ackDate: responseData.AckDt,
    signedQr: responseData.SignedQRCode,
    signedInvoice: responseData.SignedInvoice,
  };
}

/**
 * Cancel an existing IRN.
 * Allowed only within 24 hours of generation.
 */
async function cancelIRN(companyId, irn, reason, remark) {
  const config = getConfig();
  const { authToken, sek } = await authenticate(companyId);

  const cancelPayload = {
    Irn: irn,
    CnlRsn: reason || '1', // 1=Duplicate, 2=Data entry mistake, 3=Order cancelled, 4=Others
    CnlRem: remark || 'Cancelled',
  };

  const encryptedData = aesEncrypt(
    JSON.stringify(cancelPayload),
    Buffer.from(sek, 'utf8').toString('base64').substring(0, 44),
  );

  const response = await fetch(`${config.baseUrl}/eicore/v1.03/Invoice/Cancel`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      Gstin: config.gstin,
      AuthToken: authToken,
      user_name: config.username,
    },
    body: JSON.stringify({ Data: encryptedData }),
  });

  const result = await response.json();

  if (result.Status !== 1 && result.Status !== '1') {
    const errMsg = result.ErrorDetails?.map((e) => `${e.ErrorCode}: ${e.ErrorMessage}`).join('; ')
      || result.ErrorMessage || 'IRN cancellation failed';
    throw new Error(errMsg);
  }

  return { cancelled: true, cancelDate: result.Data?.CancelDate || new Date().toISOString() };
}

/**
 * Get e-Invoice details by IRN.
 */
async function getIRNDetails(companyId, irn) {
  const config = getConfig();
  const { authToken } = await authenticate(companyId);

  const response = await fetch(`${config.baseUrl}/eicore/v1.03/Invoice/irn/${irn}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      Gstin: config.gstin,
      AuthToken: authToken,
      user_name: config.username,
    },
  });

  const result = await response.json();
  if (result.Status !== 1 && result.Status !== '1') {
    throw new Error(result.ErrorMessage || 'Failed to fetch IRN details');
  }

  return result.Data;
}

/**
 * Check if e-invoicing is configured (credentials present).
 */
function isEInvoiceEnabled() {
  return !!(
    process.env.EINVOICE_CLIENT_ID &&
    process.env.EINVOICE_USERNAME &&
    process.env.EINVOICE_GSTIN
  );
}

module.exports = {
  authenticate,
  generateIRN,
  cancelIRN,
  getIRNDetails,
  buildEInvoicePayload,
  isEInvoiceEnabled,
};
