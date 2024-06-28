import React from 'react';
import { DataSourceDescription } from './DataSourceDescription';
import { render } from '@testing-library/react';

describe('<DataSourceDescription />', () => {
  it('should render data source name', () => {
    const dataSourceName = 'Test data source name';
    const { getByText } = render(
      <DataSourceDescription dataSourceName={dataSourceName} docsLink="https://grafana.com/test-datasource-docs" />
    );

    expect(getByText(dataSourceName, { exact: false })).toBeInTheDocument();
  });

  it('should render docs link', () => {
    const docsLink = 'https://grafana.com/test-datasource-docs';
    const { getByText } = render(
      <DataSourceDescription dataSourceName={'Test data source name'} docsLink={docsLink} />
    );

    const docsLinkEl = getByText('view the documentation');

    expect(docsLinkEl.getAttribute('href')).toBe(docsLink);
  });

  it('should render text about required fields by default', () => {
    const { getByText } = render(
      <DataSourceDescription
        dataSourceName={'Test data source name'}
        docsLink={'https://grafana.com/test-datasource-docs'}
      />
    );

    expect(getByText('Fields marked with', { exact: false })).toBeInTheDocument();
  });

  it('should not render text about required fields when `hasRequiredFields` props is `false`', () => {
    const { getByText } = render(
      <DataSourceDescription
        dataSourceName={'Test data source name'}
        docsLink={'https://grafana.com/test-datasource-docs'}
        hasRequiredFields={false}
      />
    );

    expect(() => getByText('Fields marked with', { exact: false })).toThrow();
  });

  it('should render passed `className`', () => {
    const { container } = render(
      <DataSourceDescription
        dataSourceName={'Test data source name'}
        docsLink={'https://grafana.com/test-datasource-docs'}
        className="test-class-name"
      />
    );

    expect(container.firstChild).toHaveClass('test-class-name');
  });
});
