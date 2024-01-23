import React from 'react';
import PivotTableUI from 'react-pivottable/PivotTableUI';
import 'react-pivottable/pivottable.css';

const PivotTable = () => {
  // Placeholder data, replace with actual data from the server
  const data = [
    ['attribute', 'value'],
    ['attribute1', 'value1'],
    ['attribute2', 'value2'],
  ];

  return (
    <div>
      <PivotTableUI
        data={data}
        onChange={s => this.setState(s)}
        {...this.state}
      />
    </div>
  );
};

export default PivotTable;