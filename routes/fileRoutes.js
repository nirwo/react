const express = require('express');
const router = express.Router();
const fileController = require('../controllers/fileController');

router.post('/upload', fileController.uploadFile);
router.post('/search', fileController.searchData);
router.post('/pivot', fileController.pivotData);

module.exports = router;