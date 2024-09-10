const express = require('express');
const router = express.Router();
const { sendMail, sendMailWithAttachment } = require('../controllers/mailController');
const authMiddleware = require('../middlewares/authMiddleware');

router.post('/mail/send', authMiddleware, sendMail);
router.post('/mail/sendWithAttachment', authMiddleware, sendMailWithAttachment);

module.exports = router;
