import React, { ChangeEvent, useMemo, useState } from 'react';
import { ConfigSection } from 'components/experimental/ConfigSection';
import { Input, Field, HorizontalGroup, Switch, SecretInput, Button } from '@grafana/ui';
import { CHHttpHeader } from 'types/config';
import allLabels from 'labels';
import { styles } from 'styles';
import { selectors as allSelectors } from 'selectors';
import { KeyValue } from '@grafana/data';

interface HttpHeadersConfigProps {
  headers?: CHHttpHeader[];
  forwardGrafanaHeaders?: boolean;
  secureFields: KeyValue<boolean>;
  onHttpHeadersChange: (v: CHHttpHeader[]) => void;
  onForwardGrafanaHeadersChange: (v: boolean) => void;
}

export const HttpHeadersConfig = (props: HttpHeadersConfigProps) => {
  const { secureFields, onHttpHeadersChange } = props;
  const configuredSecureHeaders = useConfiguredSecureHttpHeaders(secureFields);
  const [headers, setHeaders] = useState<CHHttpHeader[]>(props.headers || []);
  const [forwardGrafanaHeaders, setForwardGrafanaHeaders] = useState<boolean>(props.forwardGrafanaHeaders || false);
  const labels = allLabels.components.Config.HttpHeadersConfig;
  const selectors = allSelectors.components.Config.HttpHeaderConfig;

  const addHeader = () => setHeaders([...headers, { name: '', value: '', secure: false }]);
  const removeHeader = (index: number) => {
    const nextHeaders: CHHttpHeader[] = headers.slice();
    nextHeaders.splice(index, 1);
    setHeaders(nextHeaders);
    onHttpHeadersChange(nextHeaders);
  };
  const updateHeader = (index: number, header: CHHttpHeader) => {
    const nextHeaders: CHHttpHeader[] = headers.slice();
    header.name = header.name.trim();
    nextHeaders[index] = header;
    setHeaders(nextHeaders);
    onHttpHeadersChange(nextHeaders);
  };
  const updateForwardGrafanaHeaders = (value: boolean) => {
    setForwardGrafanaHeaders(value);
    props.onForwardGrafanaHeadersChange(value);
  }

  return (
    <ConfigSection
      title={labels.title}
    >
      <Field label={labels.label} description={labels.description}>
        <>
          {headers.map((header, index) => (
            <HttpHeaderEditor
              key={header.name + index}
              name={header.name}
              value={header.value}
              secure={header.secure}
              isSecureConfigured={configuredSecureHeaders.has(header.name)}
              onHeaderChange={header => updateHeader(index, header)}
              onRemove={() => removeHeader(index)}
            />
          ))}
          <Button
              data-testid={selectors.addHeaderButton}
              icon="plus-circle"
              variant="secondary"
              size="sm"
              onClick={addHeader}
              className={styles.Common.smallBtn}
            >
              {labels.addHeaderLabel}
          </Button>
        </>
      </Field>
      <Field label={labels.forwardGrafanaHeaders.label} description={labels.forwardGrafanaHeaders.tooltip}>
        <Switch
          data-testid={selectors.forwardGrafanaHeadersSwitch}
          className={"gf-form"}
          value={forwardGrafanaHeaders}
          onChange={(e) => updateForwardGrafanaHeaders(e.currentTarget.checked)}
        />
      </Field>
    </ConfigSection>
  );
}

interface HttpHeaderEditorProps {
  name: string;
  value: string;
  secure: boolean;
  isSecureConfigured: boolean;
  onHeaderChange: (v: CHHttpHeader) => void;
  onRemove?: () => void;
}

const HttpHeaderEditor = (props: HttpHeaderEditorProps) => {
  const { onHeaderChange, onRemove } = props;
  const [name, setName] = useState<string>(props.name);
  const [value, setValue] = useState<string>(props.value);
  const [secure, setSecure] = useState<boolean>(props.secure);
  const [isSecureConfigured, setSecureConfigured] = useState<boolean>(props.isSecureConfigured);
  const labels = allLabels.components.Config.HttpHeadersConfig;
  const selectors = allSelectors.components.Config.HttpHeaderConfig;

  const onUpdate = () => {
    onHeaderChange({
      name,
      value,
      secure
    });
  }

  let valueInput;
  if (secure) {
    valueInput = <SecretInput
      data-testid={selectors.headerValueInput}
      width={65}
      label=""
      aria-label=""
      placeholder={labels.secureHeaderValueLabel}
      value={value}
      isConfigured={isSecureConfigured}
      onReset={() => setSecureConfigured(false)}
      onChange={(e: ChangeEvent<HTMLInputElement>) => setValue(e.target.value)}
      onBlur={() => onUpdate()}
    />;
  } else {
    valueInput = <Input
      data-testid={selectors.headerValueInput}
      width={65}
      value={value}
      placeholder={labels.insecureHeaderValueLabel}
      onChange={(e: ChangeEvent<HTMLInputElement>) => setValue(e.target.value)}
      onBlur={() => onUpdate()}
    />;
  }

  const headerValueLabel = secure ? labels.secureHeaderValueLabel : labels.insecureHeaderValueLabel;
  return (
    <div data-testid={selectors.headerEditor}>
      <HorizontalGroup>
        <Field label={labels.headerNameLabel} aria-label={labels.headerNameLabel}>
          <Input
            data-testid={selectors.headerNameInput}
            value={name}
            disabled={isSecureConfigured}
            placeholder={labels.headerNamePlaceholder}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
            onBlur={() => onUpdate()}
          />
        </Field>
        <Field label={headerValueLabel} aria-label={headerValueLabel}>
          {valueInput}
        </Field>
        { !isSecureConfigured &&
          <Field label={labels.secureLabel}>
            <Switch
              data-testid={selectors.headerSecureSwitch}
              className="gf-form"
              value={secure}
              onChange={e => setSecure(e.currentTarget.checked)}
              onBlur={() => onUpdate()}
            />
          </Field>
        }
        { onRemove &&
          <Button
            data-testid={selectors.removeHeaderButton}
            className={styles.Common.smallBtn}
            variant="destructive"
            size="sm"
            icon="trash-alt"
            onClick={onRemove}
          />
        }
      </HorizontalGroup>
    </div>
  );
}

/**
 * Returns a Set of all secured headers that are configured
 */
export const useConfiguredSecureHttpHeaders = (secureJsonFields: KeyValue<boolean>): Set<string> => {
  return useMemo(() => {
    const secureHeaders = new Set<string>();
    for (let key in secureJsonFields) {
      if (key.startsWith('secureHttpHeaders.') && secureJsonFields[key]) {
        secureHeaders.add(key.substring(key.indexOf('.') + 1));
      }
    }
    return secureHeaders;
  }, [secureJsonFields]);
};
