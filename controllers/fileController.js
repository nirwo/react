const multer = require('multer');
const XLSX = require('xlsx');
const upload = multer({ dest: 'uploads/' });

let workbookData = [];

const uploadFile = (req, res) => {
  try {
    const file = req.file;
    const workbook = XLSX.readFile(file.path);
    workbookData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
    res.status(200).json({ message: 'File uploaded and processed successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Error uploading file', error });
  }
};

const searchData = (req, res) => {
  const { query } = req.body;
  // Implement search logic here
  // For now, we just return the full data
  res.status(200).json(workbookData);
};

const pivotData = (req, res) => {
  const { fields } = req.body;
  // Implement pivot logic here
  // For now, we just return the full data
  res.status(200).json(workbookData);
};

module.exports = {
  uploadFile: [upload.single('file'), uploadFile],
  searchData,
  pivotData
};