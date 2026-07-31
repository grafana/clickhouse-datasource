import React from 'react';
import { render, screen } from '@testing-library/react';
import { config } from '@grafana/runtime';
import { OpenFeature, TypedInMemoryProvider } from '@openfeature/web-sdk';
import { ConfigEditor } from './ConfigEditor';
import { mockConfigEditorProps } from '__mocks__/ConfigEditor';
import '@testing-library/jest-dom';

jest.mock('./CHConfigEditor', () => ({
  ConfigEditor: () => <div data-testid="config-editor-v1" />,
}));

jest.mock('./config-v2/CHConfigEditor', () => ({
  ConfigEditor: () => <div data-testid="config-editor-v2" />,
}));

const setLegacyToggle = (value: boolean | undefined) => {
  // The source reads featureToggles with optional chaining, so the helper must
  // not assume the runtime test environment provides the map either.
  config.featureToggles = config.featureToggles ?? ({} as typeof config.featureToggles);
  (config.featureToggles as Record<string, boolean | undefined>)['newClickhouseConfigPageDesign'] = value;
};

const registerProvider = (flagValue: boolean) =>
  OpenFeature.setProviderAndWait(
    'internal-grafana-core',
    new TypedInMemoryProvider({
      newClickhouseConfigPageDesign: {
        variants: { on: true, off: false },
        defaultVariant: flagValue ? 'on' : 'off',
        disabled: false,
      },
    })
  );

describe('ConfigEditor', () => {
  afterEach(async () => {
    setLegacyToggle(undefined);
    await OpenFeature.clearProviders();
  });

  it('renders the V1 editor when no OpenFeature provider is registered and the legacy toggle is unset', () => {
    render(<ConfigEditor {...mockConfigEditorProps()} />);
    expect(screen.getByTestId('config-editor-v1')).toBeInTheDocument();
    expect(screen.queryByTestId('config-editor-v2')).not.toBeInTheDocument();
  });

  it('renders the V2 editor when no OpenFeature provider is registered and the legacy toggle is enabled', () => {
    // Grafana versions before 12.3 never register an OpenFeature provider,
    // so the legacy featureToggles map is the only signal available.
    setLegacyToggle(true);
    render(<ConfigEditor {...mockConfigEditorProps()} />);
    expect(screen.getByTestId('config-editor-v2')).toBeInTheDocument();
    expect(screen.queryByTestId('config-editor-v1')).not.toBeInTheDocument();
  });

  it('prefers the OpenFeature provider value over the legacy toggle', async () => {
    setLegacyToggle(true);
    await registerProvider(false);
    render(<ConfigEditor {...mockConfigEditorProps()} />);
    expect(screen.getByTestId('config-editor-v1')).toBeInTheDocument();
    expect(screen.queryByTestId('config-editor-v2')).not.toBeInTheDocument();
  });

  it('renders the V2 editor when the OpenFeature provider enables the flag', async () => {
    await registerProvider(true);
    render(<ConfigEditor {...mockConfigEditorProps()} />);
    expect(screen.getByTestId('config-editor-v2')).toBeInTheDocument();
    expect(screen.queryByTestId('config-editor-v1')).not.toBeInTheDocument();
  });
});
