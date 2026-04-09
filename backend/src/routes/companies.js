const { Router } = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { z } = require('zod');
const { verifyToken } = require('../middleware/auth');
const { requireMinRole, requireRole } = require('../middleware/role');
const { validateBody } = require('../middleware/validate');
const {
  getCompany,
  updateCompany,
  uploadLogo,
  uploadSignature,
  createCompany,
} = require('../controllers/companiesController');

const router = Router();

const uploadsRoot = path.join(__dirname, '..', '..', 'uploads');
const logosRoot = path.join(uploadsRoot, 'logos');
const signaturesRoot = path.join(uploadsRoot, 'signatures');
fs.mkdirSync(logosRoot, { recursive: true });
fs.mkdirSync(signaturesRoot, { recursive: true });

function companyLogoStorage() {
  return multer.diskStorage({
    destination: (req, _file, cb) => {
      const dir = path.join(logosRoot, req.params.id);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.png';
      cb(null, `logo${ext}`);
    },
  });
}

function companySignatureStorage() {
  return multer.diskStorage({
    destination: (req, _file, cb) => {
      const dir = path.join(signaturesRoot, req.params.id);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.png';
      cb(null, `signature${ext}`);
    },
  });
}

const imageFilter = (_req, file, cb) => {
  const allowed = /\.(jpg|jpeg|png|gif|webp|svg)$/i;
  if (allowed.test(path.extname(file.originalname))) {
    cb(null, true);
  } else {
    cb(new Error('Only image files (jpg, png, gif, webp, svg) are allowed'));
  }
};

const logoUpload = multer({
  storage: companyLogoStorage(),
  fileFilter: imageFilter,
  limits: { fileSize: 2 * 1024 * 1024 },
});

const signatureUpload = multer({
  storage: companySignatureStorage(),
  fileFilter: imageFilter,
  limits: { fileSize: 1 * 1024 * 1024 },
});

const updateCompanySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  gstin: z.string().max(15).optional(),
  address: z.string().max(1000).optional(),
  phone: z.string().max(20).optional(),
  email: z.string().email().optional(),
  state_code: z.string().max(2).optional(),
  default_hsn_code: z.string().max(20).optional(),
  default_gst_rate: z.number().min(0).max(100).optional(),
}).transform((obj) => {
  // coerce string-typed default_gst_rate from form payloads
  if (typeof obj.default_gst_rate === 'string') {
    obj.default_gst_rate = parseFloat(obj.default_gst_rate);
  }
  return obj;
});

const createCompanySchema = z.object({
  name: z.string().min(1, 'Company name is required').max(255),
  gstin: z.string().max(15).optional(),
  address: z.string().max(1000).optional(),
  phone: z.string().max(20).optional(),
  email: z.string().email().optional(),
});

router.use(verifyToken);

router.get('/:id', requireMinRole('company_admin'), getCompany);

router.patch(
  '/:id',
  requireMinRole('company_admin'),
  validateBody(updateCompanySchema),
  updateCompany,
);

router.post('/:id/logo', requireMinRole('company_admin'), logoUpload.single('logo'), uploadLogo);
router.post('/:id/signature', requireMinRole('company_admin'), signatureUpload.single('signature'), uploadSignature);

router.post(
  '/',
  requireRole('super_admin'),
  validateBody(createCompanySchema),
  createCompany,
);

module.exports = router;
