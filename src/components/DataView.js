import React from 'react';

const DataView = () => {
  // Placeholder data, replace with actual data from the server
  const data = [
    { attribute: 'attribute1', value: 'value1' },
    { attribute: 'attribute2', value: 'value2' },
  ];

  return (
    <div>
      <table className="table">
        <thead>
          <tr>
            <th>Attribute</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, index) => (
            <tr key={index}>
              <td>{row.attribute}</td>
              <td>{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default DataView;