import React from 'react';
import { render } from '@testing-library/react';
import { TimeFieldEditor } from './TimeField';

describe('TimeFieldEditor', () => {
  it('renders correctly', () => {
    const result = render(
      <TimeFieldEditor fieldsList={[]} timeField="" onTimeFieldChange={() => {}} timeFieldType="" />
    );
    expect(result.container.firstChild).not.toBeNull();
  });
});
