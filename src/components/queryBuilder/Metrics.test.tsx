import React from 'react';
import { render } from '@testing-library/react';
import { MetricsEditor } from './Metrics';
import { selectors } from './../../selectors';

describe('MetricsEditor', () => {
  it('renders correctly', () => {
    const result = render(<MetricsEditor fieldsList={[]} metrics={[]} onMetricsChange={() => {}} />);
    expect(result.container.firstChild).not.toBeNull();
    if (selectors.components.QueryEditor.QueryBuilder.AGGREGATES.AddLabel) {
      expect(result.getByText(selectors.components.QueryEditor.QueryBuilder.AGGREGATES.AddLabel)).toBeInTheDocument();
    }
  });
});
