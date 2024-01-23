import React from 'react';
import axios from 'axios';

const UploadForm = () => {
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    const formData = new FormData();
    formData.append('file', file);

    axios.post('http://localhost:5000/api/files/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    .then(response => {
      console.log(response.data);
      // Handle success
    })
    .catch(error => {
      console.error(error);
      // Handle error
    });
  };

  return (
    <div className="mb-3">
      <label htmlFor="fileUpload" className="form-label">Upload XLSX File</label>
      <input className="form-control" type="file" id="fileUpload" onChange={handleFileUpload} />
    </div>
  );
};

export default UploadForm;