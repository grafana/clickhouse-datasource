import React from 'react';
import { GenericConfigSection, Props as GenericConfigSectionProps } from './GenericConfigSection';

type Props = Omit<GenericConfigSectionProps, 'kind'>;

export const ConfigSection = ({ children, ...props }: Props) => {
  return (
    <GenericConfigSection {...props} kind="section">
      {children}
    </GenericConfigSection>
  );
};
