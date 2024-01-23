import React, { useState } from 'react';
import axios from 'axios';

const SearchBar = () => {
  const [searchTerm, setSearchTerm] = useState('');

  const handleSearch = () => {
    axios.post('http://localhost:5000/api/files/search', { query: searchTerm })
      .then(response => {
        console.log(response.data);
        // Update state with search results
      })
      .catch(error => {
        console.error(error);
        // Handle error
      });
  };

  return (
    <div className="input-group mb-3">
      <input
        type="text"
        className="form-control"
        placeholder="Search..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />
      <button className="btn btn-outline-secondary" type="button" onClick={handleSearch}>Search</button>
    </div>
  );
};

export default SearchBar;