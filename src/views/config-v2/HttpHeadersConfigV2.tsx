import React, { ChangeEvent, useMemo, useState } from 'react';
import { Input, Field, SecretInput, Button, Stack, Checkbox, Box } from '@grafana/ui';
import { CHConfig, CHHttpHeader, CHSecureConfig } from 'types/config';
import allLabels from './labelsV2';
import { styles } from 'styles';
import { selectors as allSelectors } from 'selectors';
import { DataSourcePluginOptionsEditorProps, KeyValue, onUpdateDatasourceJsonDataOptionChecked } from '@grafana/data';

interface HttpHeadersConfigProps extends DataSourcePluginOptionsEditorProps<CHConfig, CHSecureConfig> {
  headers?: CHHttpHeader[];
  forwardGrafanaHeaders?: boolean;
  secureFields: KeyValue<boolean>;
  onHttpHeadersChange: (v: CHHttpHeader[]) => void;
}

export const HttpHeadersConfigV2 = (props: HttpHeadersConfigProps) => {
  const { secureFields, onHttpHeadersChange } = props;
  const configuredSecureHeaders = useConfiguredSecureHttpHeaders(secureFields);
  const [headers, setHeaders] = useState<CHHttpHeader[]>(props.headers || []);
  const [forwardGrafanaHeaders, setForwardGrafanaHeaders] = useState<boolean>(props.forwardGrafanaHeaders || false);
  const labels = allLabels.components.Config.HttpHeadersConfig;
  const selectors = allSelectors.components.Config.HttpHeaderConfig;

  const addHeader = () => setHeaders([...headers, { name: '', value: '', secure: false }]);

  const removeHeader = (index: number) => {
    const nextHeaders: CHHttpHeader[] = [...headers.slice(0, index), ...headers.slice(index + 1)];
    setHeaders(nextHeaders);
    onHttpHeadersChange(nextHeaders);
  };

  const updateHeader = (index: number, header: CHHttpHeader) => {
    const nextHeaders: CHHttpHeader[] = [
      ...headers.slice(0, index),
      { ...header, name: header.name.trim() },
      ...headers.slice(index + 1),
    ];
    setHeaders(nextHeaders);
    onHttpHeadersChange(nextHeaders);
  };

  const updateForwardGrafanaHeaders = (e: React.SyntheticEvent<HTMLInputElement, Event>) => {
    setForwardGrafanaHeaders(e.currentTarget.checked);
    onUpdateDatasourceJsonDataOptionChecked(props, 'forwardGrafanaHeaders')(e);
  };

  return (
    <div style={{ marginLeft: '30px' }}>
      <Field label={labels.label}>
        <>
          {headers.map((header, index) => (
            <HttpHeaderEditorV2
              key={header.name + index}
              name={header.name}
              value={header.value}
              secure={header.secure}
              isSecureConfigured={configuredSecureHeaders.has(header.name)}
              onHeaderChange={(h) => updateHeader(index, h)}
              onRemove={() => removeHeader(index)}
            />
          ))}
          <Button
            data-testid={selectors.addHeaderButton}
            icon="plus"
            variant="secondary"
            size="sm"
            onClick={addHeader}
            className={styles.Common.smallBtn}
          >
            {labels.addHeaderLabel}
          </Button>
        </>
      </Field>

      <Checkbox
        label={labels.forwardGrafanaHeaders.label}
        checked={forwardGrafanaHeaders}
        onChange={(e) => updateForwardGrafanaHeaders(e)}
      />
    </div>
  );
};

interface HttpHeaderEditorProps {
  name: string;
  value: string;
  secure: boolean;
  isSecureConfigured: boolean;
  onHeaderChange: (v: CHHttpHeader) => void;
  onRemove?: () => void;
}

const HttpHeaderEditorV2 = (props: HttpHeaderEditorProps) => {
  const { onHeaderChange, onRemove } = props;
  const [name, setName] = useState<string>(props.name);
  const [value, setValue] = useState<string>(props.value);
  const [secure, setSecure] = useState<boolean>(props.secure);
  const [isSecureConfigured, setSecureConfigured] = useState<boolean>(props.isSecureConfigured);

  const labels = allLabels.components.Config.HttpHeadersConfig;
  const selectors = allSelectors.components.Config.HttpHeaderConfig;

  const onUpdate = () => {
    onHeaderChange({ name, value, secure });
  };

  const headerValueLabel = secure ? labels.secureHeaderValueLabel : labels.insecureHeaderValueLabel;

  return (
    <div data-testid={selectors.headerEditor} style={{ marginTop: '10px' }}>
      <Stack direction="row" alignItems="center" gap={1}>
        <Field label={labels.headerNameLabel} aria-label={labels.headerNameLabel}>
          <Input
            data-testid={selectors.headerNameInput}
            value={name}
            disabled={isSecureConfigured}
            placeholder={labels.headerNamePlaceholder}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
            onBlur={onUpdate}
          />
        </Field>

        <Box flex="1 1 auto">
          <Field label={headerValueLabel} aria-label={headerValueLabel}>
            {secure ? (
              <SecretInput
                data-testid={selectors.headerValueInput}
                placeholder={labels.secureHeaderValueLabel}
                value={value}
                isConfigured={isSecureConfigured}
                onReset={() => setSecureConfigured(false)}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setValue(e.target.value)}
                onBlur={onUpdate}
              />
            ) : (
              <Input
                data-testid={selectors.headerValueInput}
                value={value}
                placeholder={labels.insecureHeaderValueLabel}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setValue(e.target.value)}
                onBlur={onUpdate}
              />
            )}
          </Field>
        </Box>

        {!isSecureConfigured && (
          <Checkbox
            label={labels.secureLabel}
            checked={secure}
            onChange={(e) => setSecure(e.currentTarget.checked)}
            data-testid={selectors.forwardGrafanaHeadersSwitch}
          />
        )}

        {onRemove && (
          <Button
            data-testid={selectors.removeHeaderButton}
            className={styles.Common.smallBtn}
            variant="destructive"
            size="sm"
            icon="trash-alt"
            onClick={onRemove}
          />
        )}
      </Stack>
    </div>
  );
};

/**
 * Returns a Set of all secured headers that are configured
 */
export const useConfiguredSecureHttpHeaders = (secureJsonFields: KeyValue<boolean>): Set<string> => {
  return useMemo(() => {
    const secureHeaders = new Set<string>();
    for (const key in secureJsonFields) {
      if (key.startsWith('secureHttpHeaders.') && secureJsonFields[key]) {
        secureHeaders.add(key.substring(key.indexOf('.') + 1));
      }
    }
    return secureHeaders;
  }, [secureJsonFields]);
};
