import React from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { Icon, Tooltip, useStyles2 } from '@grafana/ui';
import { Filter, FilterOperator } from 'types/queryBuilder';

interface FilterTagBarProps {
  filters: Filter[];
  onRemoveFilter: (index: number) => void;
}

const getStyles = (theme: GrafanaTheme2) => ({
  bar: css`
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: ${theme.spacing(0.5)};
    padding: ${theme.spacing(0.5)} 0;
    min-height: 28px;
  `,
  tag: css`
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 6px 2px 8px;
    border-radius: ${theme.shape.radius.pill};
    background: ${theme.colors.background.secondary};
    border: 1px solid ${theme.colors.border.medium};
    font-size: ${theme.typography.bodySmall.fontSize};
    font-family: ${theme.typography.fontFamilyMonospace};
    color: ${theme.colors.text.primary};
    max-width: 400px;
    white-space: nowrap;
  `,
  tagContent: css`
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  `,
  tagKey: css`
    color: ${theme.colors.primary.text};
    font-weight: ${theme.typography.fontWeightMedium};
  `,
  tagOperator: css`
    color: ${theme.colors.text.secondary};
  `,
  tagValue: css`
    color: ${theme.colors.text.primary};
  `,
  removeBtn: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: ${theme.colors.text.secondary};
    border-radius: 50%;
    padding: 1px;
    flex-shrink: 0;
    &:hover {
      color: ${theme.colors.text.primary};
      background: ${theme.colors.action.hover};
    }
  `,
  label: css`
    font-size: ${theme.typography.bodySmall.fontSize};
    color: ${theme.colors.text.secondary};
    margin-right: ${theme.spacing(0.5)};
    font-weight: ${theme.typography.fontWeightMedium};
  `,
});

const getFilterDisplayName = (filter: Filter): string => {
  const key = filter.key || (filter.hint ? filter.hint.replace(/_/g, ' ') : '?');
  const mapSuffix = 'mapKey' in filter && filter.mapKey ? `.${filter.mapKey}` : '';
  return `${key}${mapSuffix}`;
};

const getFilterDisplayValue = (filter: Filter): string => {
  if (filter.operator === FilterOperator.IsAnything) {
    return '';
  }
  if (filter.operator === FilterOperator.IsNull || filter.operator === FilterOperator.IsNotNull) {
    return '';
  }
  if (filter.operator === FilterOperator.IsEmpty || filter.operator === FilterOperator.IsNotEmpty) {
    return '';
  }
  if (filter.operator === FilterOperator.WithInGrafanaTimeRange) {
    return 'dashboard time';
  }
  if (filter.operator === FilterOperator.OutsideGrafanaTimeRange) {
    return 'outside dashboard time';
  }
  if ('value' in filter && filter.value !== undefined) {
    const value = String(filter.value);
    return value.length > 30 ? value.substring(0, 27) + '...' : value;
  }
  return '';
};

const getOperatorDisplay = (operator: FilterOperator): string => {
  switch (operator) {
    case FilterOperator.IsAnything:
      return 'is anything';
    case FilterOperator.IsNull:
      return 'is null';
    case FilterOperator.IsNotNull:
      return 'is not null';
    case FilterOperator.IsEmpty:
      return 'is empty';
    case FilterOperator.IsNotEmpty:
      return 'is not empty';
    default:
      return operator;
  }
};

export const FilterTagBar = (props: FilterTagBarProps) => {
  const { filters, onRemoveFilter } = props;
  const styles = useStyles2(getStyles);

  const activeFilters = filters.filter(
    (filter) =>
      (filter.operator !== FilterOperator.IsAnything || filter.key !== '') &&
      filter.operator !== FilterOperator.WithInGrafanaTimeRange &&
      filter.operator !== FilterOperator.OutsideGrafanaTimeRange
  );

  if (activeFilters.length === 0) {
    return null;
  }

  return (
    <div className={styles.bar} data-testid="filter-tag-bar">
      <span className={styles.label}>Filters:</span>
      {filters.map((filter, index) => {
        if (filter.operator === FilterOperator.IsAnything && !filter.key) {
          return null;
        }
        if (
          filter.operator === FilterOperator.WithInGrafanaTimeRange ||
          filter.operator === FilterOperator.OutsideGrafanaTimeRange
        ) {
          return null;
        }

        const name = getFilterDisplayName(filter);
        const operator = getOperatorDisplay(filter.operator);
        const value = getFilterDisplayValue(filter);

        return (
          <Tooltip key={index} content={`${name} ${operator} ${value}`.trim()} placement="top">
            <span className={styles.tag}>
              <span className={styles.tagContent}>
                <span className={styles.tagKey}>{name}</span>
                <span className={styles.tagOperator}> {operator} </span>
                {value && <span className={styles.tagValue}>{value}</span>}
              </span>
              <span className={styles.removeBtn} onClick={() => onRemoveFilter(index)} role="button" tabIndex={0}>
                <Icon name="times" size="sm" />
              </span>
            </span>
          </Tooltip>
        );
      })}
    </div>
  );
};
