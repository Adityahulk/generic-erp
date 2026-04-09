/** Default invoice template layout (merged with DB layout_config). */
const DEFAULT_LAYOUT = {
  show_logo: true,
  show_signature: true,
  show_qr_code: false,
  show_bank_details: false,
  show_terms: true,
  terms_text: 'Goods once sold will not be taken back or exchanged. Subject to local jurisdiction.',
  primary_color: '#1a56db',
  font: 'default',
  header_style: 'left-aligned',
  show_vehicle_details_block: true,
  show_loan_summary: false,
  footer_text: '',
  bank_details: '',
};

module.exports = { DEFAULT_LAYOUT };
