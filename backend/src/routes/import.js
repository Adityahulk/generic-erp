const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { Router } = require('express');
const { z } = require('zod');
const { validateBody } = require('../middleware/validate');
const { verifyToken } = require('../middleware/auth');
const { requireMinRole } = require('../middleware/role');
const ic = require('../controllers/importController');

const uploadDir = path.join(__dirname, '../../uploads/import-temp');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '') || '.bin';
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
});

const router = Router();
router.use(verifyToken);
router.use(requireMinRole('branch_manager'));

const confirmSchema = z.object({
  importSessionId: z.string().uuid(),
  type: z.enum(['vehicles', 'sales', 'purchases', 'quotations']),
  branchId: z.string().uuid(),
});

router.post('/preview', upload.single('file'), ic.preview);
router.post('/confirm', validateBody(confirmSchema), ic.confirmImport);
router.get('/template/:type', ic.downloadTemplate);

module.exports = router;
