const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const prisma = require('../../config/prisma');
const { authenticate, sameCompany } = require('../../middleware/auth');
const { success, created, paginated, notFound } = require('../../utils/response');
const { paginate, paginateMeta } = require('../../utils/helpers');
const { v4: uuidv4 } = require('uuid');

const uploadDir = process.env.UPLOAD_PATH || './uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: (parseInt(process.env.MAX_FILE_SIZE) || 50) * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.png', '.jpg', '.jpeg', '.gif', '.mp4', '.mp3', '.zip', '.txt', '.csv'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowed.includes(ext)) {
      return cb(new Error('File type not allowed: ' + file.mimetype));
    }
    cb(null, true);
  },
});

router.use(authenticate, sameCompany);

// Folders
router.get('/folders', async (req, res, next) => {
  try {
    const { parentId } = req.query;
    const folders = await prisma.documentFolder.findMany({
      where: {
        companyId: req.companyId,
        parentId: parentId || null,
      },
      include: { _count: { select: { documents: true, children: true } } },
    });
    return success(res, folders);
  } catch (err) { next(err); }
});

router.post('/folders', async (req, res, next) => {
  try {
    const folder = await prisma.documentFolder.create({
      data: { ...req.body, companyId: req.companyId },
    });
    return created(res, folder, 'Folder created');
  } catch (err) { next(err); }
});

router.delete('/folders/:id', async (req, res, next) => {
  try {
    const existing = await prisma.documentFolder.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!existing) return notFound(res, 'Folder not found');
    await prisma.documentFolder.delete({ where: { id: req.params.id } });
    return success(res, {}, 'Folder deleted');
  } catch (err) { next(err); }
});

// Documents
router.get('/', async (req, res, next) => {
  try {
    const { page = 1, limit = 50, folderId, search, projectId, tags } = req.query;
    const { take, skip } = paginate(page, limit);
    const where = {
      companyId: req.companyId,
      folderId: folderId || null,
      ...(projectId && { projectId }),
      ...(search && { name: { contains: search, mode: 'insensitive' } }),
      ...(tags && { tags: { hasSome: tags.split(',') } }),
    };
    const [docs, total] = await Promise.all([
      prisma.document.findMany({ where, take, skip, orderBy: { createdAt: 'desc' } }),
      prisma.document.count({ where }),
    ]);
    return paginated(res, docs, paginateMeta(total, page, limit));
  } catch (err) { next(err); }
});

router.post('/upload', (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message || 'File upload failed' });
    next();
  });
}, async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

    const doc = await prisma.document.create({
      data: {
        companyId: req.companyId,
        folderId: req.body.folderId || null,
        projectId: req.body.projectId || null,
        name: req.body.name || req.file.originalname,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        path: req.file.path,
        url: `/uploads/${req.file.filename}`,
        tags: req.body.tags ? req.body.tags.split(',') : [],
        uploadedById: req.userId,
      },
    });
    return created(res, doc, 'File uploaded');
  } catch (err) { next(err); }
});

router.post('/upload-multiple', (req, res, next) => {
  upload.array('files', 20)(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message || 'File upload failed' });
    next();
  });
}, async (req, res, next) => {
  try {
    if (!req.files?.length) return res.status(400).json({ success: false, message: 'No files uploaded' });
    const docs = await prisma.document.createMany({
      data: req.files.map(f => ({
        companyId: req.companyId,
        folderId: req.body.folderId || null,
        name: f.originalname,
        originalName: f.originalname,
        mimeType: f.mimetype,
        size: f.size,
        path: f.path,
        url: `/uploads/${f.filename}`,
        uploadedById: req.userId,
      })),
    });
    return created(res, docs, 'Files uploaded');
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const doc = await prisma.document.findFirst({
      where: { id: req.params.id, companyId: req.companyId },
    });
    if (!doc) return notFound(res, 'Document not found');
    return success(res, doc);
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const existing = await prisma.document.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!existing) return notFound(res, 'Document not found');
    const doc = await prisma.document.update({ where: { id: req.params.id }, data: req.body });
    return success(res, doc, 'Document updated');
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const doc = await prisma.document.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!doc) return notFound(res, 'Document not found');
    if (doc.path && fs.existsSync(doc.path)) fs.unlinkSync(doc.path);
    await prisma.document.delete({ where: { id: req.params.id } });
    return success(res, {}, 'Document deleted');
  } catch (err) { next(err); }
});

// Download
router.get('/:id/download', async (req, res, next) => {
  try {
    const doc = await prisma.document.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!doc) return notFound(res, 'Document not found');
    res.download(doc.path, doc.originalName);
  } catch (err) { next(err); }
});

module.exports = router;
