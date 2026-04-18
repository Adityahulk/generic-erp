const { z } = require('zod');
const { query } = require('../config/db');
const {
  getMergedConfig,
  invalidateConfigCache,
  listTemplates,
  templateForType,
  deepMerge,
  BUSINESS_TYPES,
} = require('../services/businessConfigService');

async function listFieldDefinitions(companyId) {
  const { rows } = await query(
    `SELECT id, field_key, field_label, field_type, field_options, is_required, show_in_list, sort_order
     FROM item_field_definitions WHERE company_id = $1 ORDER BY sort_order ASC, field_label ASC`,
    [companyId],
  );
  return rows;
}

async function getConfig(req, res) {
  try {
    const companyId = req.user.company_id;
    if (!companyId) {
      return res.status(400).json({ error: 'No company context for this user' });
    }
    const merged = await getMergedConfig(companyId);
    const field_definitions = await listFieldDefinitions(companyId);
    res.json({
      ...merged,
      field_definitions,
    });
  } catch (err) {
    console.error('getConfig error:', err.message);
    res.status(500).json({ error: 'Failed to load business config' });
  }
}

const BUSINESS_TYPE_ENUM = z.enum([...BUSINESS_TYPES].sort());

const patchSchema = z.object({
  business_type: BUSINESS_TYPE_ENUM.optional(),
  business_config: z.any().optional(),
}).refine((b) => b.business_type !== undefined || b.business_config !== undefined, {
  message: 'Provide business_type and/or business_config',
});

async function patchConfig(req, res) {
  try {
    const companyId = req.user.company_id;
    if (!companyId) {
      return res.status(400).json({ error: 'No company context for this user' });
    }
    const parsed = patchSchema.parse(req.body);

    const { rows } = await query(
      `SELECT business_config FROM companies WHERE id = $1 AND is_deleted = FALSE`,
      [companyId],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Company not found' });

    const sets = [];
    const params = [];
    let i = 1;
    if (parsed.business_type !== undefined) {
      sets.push(`business_type = $${i++}`);
      params.push(parsed.business_type);
    }
    if (parsed.business_config !== undefined) {
      const nextConfig = deepMerge(rows[0].business_config || {}, parsed.business_config);
      sets.push(`business_config = $${i++}::jsonb`);
      params.push(JSON.stringify(nextConfig));
    }
    if (sets.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    params.push(companyId);

    const { rows: out } = await query(
      `UPDATE companies SET ${sets.join(', ')}
       WHERE id = $${i} AND is_deleted = FALSE
       RETURNING id, name, business_type, business_config, item_terminology, item_terminology_plural, default_hsn_code, default_gst_rate`,
      params,
    );

    await invalidateConfigCache(companyId);
    const merged = await getMergedConfig(companyId, { bypassCache: true });
    const field_definitions = await listFieldDefinitions(companyId);
    res.json({ company: out[0], config: { ...merged, field_definitions } });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.errors.map((e) => e.message).join('; ') });
    }
    console.error('patchConfig error:', err.message);
    res.status(500).json({ error: 'Failed to update business config' });
  }
}

async function getTemplates(_req, res) {
  res.json({ templates: listTemplates() });
}

const resetBodySchema = z.object({
  confirm: z.literal(true),
});

async function resetConfig(req, res) {
  try {
    const companyId = req.user.company_id;
    if (!companyId) {
      return res.status(400).json({ error: 'No company context for this user' });
    }
    const businessType = req.params.businessType;
    if (!BUSINESS_TYPES.has(businessType)) {
      return res.status(400).json({ error: 'Invalid business type' });
    }
    resetBodySchema.parse(req.body || {});

    await query(
      `UPDATE companies SET business_type = $1, business_config = '{}'::jsonb WHERE id = $2 AND is_deleted = FALSE`,
      [businessType, companyId],
    );
    await invalidateConfigCache(companyId);
    const merged = await getMergedConfig(companyId, { bypassCache: true });
    const field_definitions = await listFieldDefinitions(companyId);
    res.json({
      preview_template: templateForType(businessType),
      config: { ...merged, field_definitions },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.errors.map((e) => e.message).join('; ') });
    }
    console.error('resetConfig error:', err.message);
    res.status(500).json({ error: 'Failed to reset business config' });
  }
}

module.exports = { getConfig, patchConfig, getTemplates, resetConfig };
