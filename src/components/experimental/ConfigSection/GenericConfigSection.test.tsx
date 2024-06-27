import React from 'react';
import { screen, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GenericConfigSection } from './GenericConfigSection';

let user = userEvent.setup();

describe('<GenericConfigSection />', () => {
  beforeEach(() => {
    userEvent.setup();
  });

  it('should render title', () => {
    render(
      <GenericConfigSection title="Test title">
        <div>Content</div>
      </GenericConfigSection>
    );

    expect(screen.getByText('Test title')).toBeInTheDocument();
  });

  it('should render title as <h3> by default', () => {
    render(
      <GenericConfigSection title="Test title">
        <div>Content</div>
      </GenericConfigSection>
    );

    expect(screen.getByText('Test title').tagName).toBe('H3');
  });

  it('should render title as <h3> when `kind` is `section`', () => {
    render(
      <GenericConfigSection title="Test title" kind="section">
        <div>Content</div>
      </GenericConfigSection>
    );

    expect(screen.getByText('Test title').tagName).toBe('H3');
  });

  it('should render title as <h6> when `kind` is `sub-section`', () => {
    render(
      <GenericConfigSection title="Test title" kind="sub-section">
        <div>Content</div>
      </GenericConfigSection>
    );

    expect(screen.getByText('Test title').tagName).toBe('H6');
  });

  it('should render description', () => {
    render(
      <GenericConfigSection title="Test title" description="Test description">
        <div>Content</div>
      </GenericConfigSection>
    );

    expect(screen.getByText('Test description')).toBeInTheDocument();
  });

  it('should not be collapsible by default', () => {
    render(
      <GenericConfigSection title="Test title">
        <div>Test content</div>
      </GenericConfigSection>
    );

    expect(screen.getByText('Test content')).toBeInTheDocument();
    expect(() => screen.getByLabelText('Expand section Test title')).toThrow();
    expect(() => screen.getByLabelText('Collapse section Test title')).toThrow();
  });

  it('should be collapsible with content visible when `isCollapsible` is `true` and `isInitiallyOpen` is not passed', async () => {
    render(
      <GenericConfigSection title="Test title" isCollapsible>
        <div>Test content</div>
      </GenericConfigSection>
    );

    expect(screen.getByText('Test content')).toBeInTheDocument();

    await user.click(screen.getByLabelText('Collapse section Test title'));

    expect(() => screen.getByText('Test content')).toThrow();
  });

  it('should be collapsible with content visible when `isCollapsible` is `true` and `isInitiallyOpen` is `true`', async () => {
    render(
      <GenericConfigSection title="Test title" isCollapsible isInitiallyOpen={true}>
        <div>Test content</div>
      </GenericConfigSection>
    );

    expect(screen.getByText('Test content')).toBeInTheDocument();

    await user.click(screen.getByLabelText('Collapse section Test title'));

    expect(() => screen.getByText('Test content')).toThrow();
  });

  it('should be collapsible with content hidden when `isCollapsible` is `true` and `isInitiallyOpen` is `false`', async () => {
    render(
      <GenericConfigSection title="Test title" isCollapsible isInitiallyOpen={false}>
        <div>Test content</div>
      </GenericConfigSection>
    );

    expect(() => screen.getByText('Test content')).toThrow();

    await user.click(screen.getByLabelText('Expand section Test title'));

    expect(screen.getByText('Test content')).toBeInTheDocument();
  });

  it('should have passed `className`', () => {
    const { container } = render(
      <GenericConfigSection title="Test title" className="test-class">
        <div>Test content</div>
      </GenericConfigSection>
    );

    expect(container.firstChild).toHaveClass('test-class');
  });
});
