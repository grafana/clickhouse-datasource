import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import { LeftSidebar } from './LeftSidebar';
import { CONFIG_SECTION_HEADERS, CONFIG_SECTION_HEADERS_WITH_PDC } from './constants';

describe('LeftSidebar', () => {
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    // Mock console.error to suppress React act() warnings
    consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.clearAllMocks();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('renders all default headers when pdcInjected is false', () => {
    render(<LeftSidebar pdcInjected={false} />);

    CONFIG_SECTION_HEADERS.forEach((header) => {
      expect(screen.getByTestId(`${header.label}-sidebar`)).toBeInTheDocument();
      expect(screen.getByText(header.label)).toBeInTheDocument();
    });
  });

  it('renders all PDC headers when pdcInjected is true', () => {
    render(<LeftSidebar pdcInjected={true} />);

    CONFIG_SECTION_HEADERS_WITH_PDC.forEach((header) => {
      expect(screen.getByTestId(`${header.label}-sidebar`)).toBeInTheDocument();
      expect(screen.getByText(header.label)).toBeInTheDocument();
    });
  });

  it('shows optional text for optional headers', () => {
    render(<LeftSidebar pdcInjected={false} />);

    CONFIG_SECTION_HEADERS.filter((h) => h.isOptional).forEach((header) => {
      expect(screen.getByTestId(`${header.label}-sidebar`).querySelector('div')).toHaveTextContent(/optional/i);
    });
  });

  it('scrolls to the target with offset when link is clicked', () => {
    render(<LeftSidebar pdcInjected={false} />);
    const firstHeader = CONFIG_SECTION_HEADERS[0];

    const target = document.createElement('div');
    target.id = firstHeader.id;
    target.getBoundingClientRect = jest.fn(() => ({ top: 200 }) as any);
    document.body.appendChild(target);

    Object.defineProperty(window, 'scrollY', { value: 100, writable: true });
    const scrollToSpy = jest.spyOn(window, 'scrollTo').mockImplementation(() => {});

    fireEvent.click(screen.getByText(firstHeader.label));

    expect(scrollToSpy).toHaveBeenCalledWith({ top: 240, behavior: 'smooth' });

    scrollToSpy.mockRestore();
    document.body.removeChild(target);
  });
});
