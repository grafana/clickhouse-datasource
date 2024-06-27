import React, { useState, ReactNode } from 'react';
import { css } from '@emotion/css';
import { useTheme2, IconButton, IconName } from '@grafana/ui';

export type Props = {
  title: string;
  description?: ReactNode;
  isCollapsible?: boolean;
  isInitiallyOpen?: boolean;
  kind?: 'section' | 'sub-section';
  className?: string;
  children: ReactNode;
};

export const GenericConfigSection = ({
  children,
  title,
  description,
  isCollapsible = false,
  isInitiallyOpen = true,
  kind = 'section',
  className,
}: Props) => {
  const { colors, typography, spacing } = useTheme2();
  const [isOpen, setIsOpen] = useState(isCollapsible ? isInitiallyOpen : true);
  const iconName: IconName = isOpen ? 'angle-up' : 'angle-down';
  const isSubSection = kind === 'sub-section';
  const collapsibleButtonAriaLabel = `${isOpen ? 'Collapse' : 'Expand'} section ${title}`;

  const styles = {
    header: css({
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    }),
    title: css({
      margin: 0,
    }),
    subtitle: css({
      margin: 0,
      fontWeight: typography.fontWeightRegular,
    }),
    descriptionText: css({
      marginTop: spacing(isSubSection ? 0.25 : 0.5),
      marginBottom: 0,
      ...typography.bodySmall,
      color: colors.text.secondary,
    }),
    content: css({
      marginTop: spacing(2),
    }),
  };

  return (
    <div className={className}>
      <div className={styles.header}>
        {kind === 'section' ? <h3 className={styles.title}>{title}</h3> : <h6 className={styles.subtitle}>{title}</h6>}
        {isCollapsible && (
          <IconButton
            name={iconName}
            onClick={() => setIsOpen(!isOpen)}
            type="button"
            size="xl"
            aria-label={collapsibleButtonAriaLabel}
          />
        )}
      </div>
      {description && <p className={styles.descriptionText}>{description}</p>}
      {isOpen && <div className={styles.content}>{children}</div>}
    </div>
  );
};
