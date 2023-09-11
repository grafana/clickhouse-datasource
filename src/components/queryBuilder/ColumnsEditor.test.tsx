import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { FieldsEditor } from './Fields';
import { FullField } from './../../types';

describe('FieldsEditor', () => {
  const fields: string[] = ['Name', 'StageName'];
  const list: FullField[] = [
    { name: 'Name', label: 'Field Name', type: 'string', picklistValues: [] },
    { name: 'Type', label: 'Field Type', type: 'string', picklistValues: [] },
    { name: 'StageName', label: 'Stage', type: 'string', picklistValues: [] },
    { name: 'Dummy', label: 'Dummy', type: 'string', picklistValues: [] },
  ];
  it('should render default value when no options passed', () => {
    const result = render(<FieldsEditor fieldsList={[]} fields={[]} onFieldsChange={() => {}} />);
    expect(result.container.firstChild).not.toBeNull();
    expect(result.getByTestId('query-builder-fields-multi-select-container')).toBeInTheDocument();
  });
  it('should render the correct values when passed', () => {
    const onFieldsChange = jest.fn();
    const result = render(<FieldsEditor fieldsList={list} fields={fields} onFieldsChange={onFieldsChange} />);
    expect(result.container.firstChild).not.toBeNull();
    expect(result.getByTestId('query-builder-fields-multi-select-container')).toBeInTheDocument();
    expect(result.queryAllByText('Standard Fields').length).toBe(0);
    expect(result.getByText('Field Name')).toBeInTheDocument();
    expect(result.getByText('Stage')).toBeInTheDocument();
    expect(result.queryAllByText('Dummy').length).toBe(0);
    expect(onFieldsChange).toHaveBeenCalledTimes(0);
  });
  it('should render the popup values when clicked', async () => {
    const onFieldsChange = jest.fn();

    const result = render(<FieldsEditor fieldsList={list} fields={fields} onFieldsChange={onFieldsChange} />);
    expect(onFieldsChange).toHaveBeenCalledTimes(0);

    expect(result.queryAllByText('Dummy').length).toBe(0); // Popup should be in closed state
    fireEvent.focus(screen.getByRole('combobox'));
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' });
    expect(result.getByText('Dummy')).toBeInTheDocument(); // Popup should be in the open state
    expect(result.getByText('Field Type')).toBeInTheDocument();
    fireEvent.click(result.getByText('Field Type'));
    expect(result.queryAllByText('Dummy').length).toBe(0); // Popup should be in closed state
    expect(result.getByText('Field Type')).toBeInTheDocument();
    fireEvent.blur(screen.getByRole('combobox'));
    expect(onFieldsChange).toHaveBeenCalledTimes(2);

    expect(result.queryAllByText('Dummy').length).toBe(0); // Popup should be in closed state
  });

  it('should close when clicked outside', () => {
    const onFieldsChange = jest.fn();

    const result = render(<FieldsEditor fieldsList={list} fields={fields} onFieldsChange={onFieldsChange} />);
    expect(onFieldsChange).toHaveBeenCalledTimes(0);

    expect(result.queryAllByText('Dummy').length).toBe(0); // Popup should be in closed state
    fireEvent.focus(screen.getByRole('combobox'));
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' });
    expect(result.getByText('Dummy')).toBeInTheDocument(); // Popup should be in the open state
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Esc' });
    expect(result.queryAllByText('Dummy').length).toBe(0); // Popup should be in closed state
    expect(onFieldsChange).toHaveBeenCalledTimes(0);
  });
});
