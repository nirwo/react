import React from 'react';
import UploadForm from './components/UploadForm';
import SearchBar from './components/SearchBar';
import PivotTable from './components/PivotTable';
import DataView from './components/DataView';

function App() {
  return (
    <div className="container">
      <h1>XLSX Data Processor</h1>
      <UploadForm />
      <SearchBar />
      <PivotTable />
      <DataView />
    </div>
  );
}

export default App;