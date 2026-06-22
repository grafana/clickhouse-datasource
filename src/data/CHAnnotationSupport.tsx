import React, { useCallback, useMemo } from 'react';
import { AnnotationQuery, AnnotationSupport, GrafanaTheme2, QueryEditorProps } from '@grafana/data';
import { InlineFormLabel, Select, TextArea, useStyles2 } from '@grafana/ui';
import { css } from '@emotion/css';
import { Datasource } from './CHDatasource';
import { escapeIdentifier } from './sqlGenerator';
import { CHQuery, CHSqlQuery, EditorType } from 'types/sql';
import { CHConfig } from 'types/config';
import { SchemaPicker, SchemaPickerValue } from 'components/queryBuilder/SchemaPicker';
import useColumns from 'hooks/useColumns';

/** Annotation preset types. */
type AnnotationPreset = 'custom' | 'change_detection';

/** Builder state for the change-detection preset: a schema selection plus a group-by column. */
type ChangeDetectionState = SchemaPickerValue & { groupBy?: string };

/** Annotation query extended with the builder state the editor needs to round-trip. */
interface CHAnnotationQuery extends AnnotationQuery<CHQuery> {
  preset?: AnnotationPreset;
  changeDetection?: ChangeDetectionState;
}

/** Props Grafana passes to an annotation QueryEditor (the base props plus annotation-specific ones). */
type AnnotationEditorProps = QueryEditorProps<Datasource, CHQuery, CHConfig> & {
  annotation?: CHAnnotationQuery;
  onAnnotationChange?: (annotation: CHAnnotationQuery) => void;
};

const ANNOTATION_REF_ID = 'annotation';

/** Minimal defaults used only when Grafana mounts the editor without an existing annotation. */
const DEFAULT_ANNOTATION: CHAnnotationQuery = { name: '', enable: true, iconColor: 'red' };

/**
 * Escape a value for use inside a single-quoted ClickHouse string literal.
 * Backslashes and single quotes are the only characters that can break out of
 * the literal. There is no exported string-literal escaper in sqlGenerator
 * (escapeValue is unexported and bails out on special characters), so this
 * stays local and small.
 */
const escapeStringContent = (value: string): string => value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

/** Build the SQL annotation target, preserving the existing refId and plugin version. */
const buildTarget = (existing: Partial<CHQuery> | undefined, rawSql: string): CHSqlQuery => ({
  pluginVersion: existing?.pluginVersion ?? '',
  editorType: EditorType.SQL,
  rawSql,
  refId: existing?.refId || ANNOTATION_REF_ID,
});

/**
 * Resolve the default database and table for the change-detection preset.
 * Prefers the traces OTel config, then the single-table config when it is
 * configured for traces, then the general default database with the
 * conventional otel_traces table. This adapts to both all-databases and
 * single-table datasources.
 */
export function resolveTraceSchema(datasource: Datasource): { database: string; table: string } {
  const { jsonData } = datasource.settings;
  const singleTable =
    jsonData.configMode === 'single-table' && jsonData.signalType === 'traces'
      ? datasource.getDefaultTable()
      : undefined;
  return {
    database: datasource.getDefaultTraceDatabase() || datasource.getDefaultDatabase(),
    table: datasource.getDefaultTraceTable() || singleTable || 'otel_traces',
  };
}

/**
 * Generate the change-detection SQL from builder selections.
 * Per 30-second bucket take the dominant value (topK(1)) so a service running
 * two versions at once (canary, rolling deploy, multiple replicas) does not
 * flap between them, then use lagInFrame() to detect transitions per group,
 * including rollbacks (v1.0 -> v1.1 -> v1.0 produces three annotations). The
 * outer prev_version != '' guard drops each group's first bucket in the window,
 * where lagInFrame() returns '' and would otherwise mark every group at the
 * left edge of the dashboard range.
 * Identifiers are escaped; the watched map key is emitted as a quoted string literal.
 */
export function generateChangeDetectionSQL(opts: ChangeDetectionState): string {
  const { database, table, column, mapKey, groupBy } = opts;
  if (!table || !column) {
    return '-- Select a table and column above to generate the change detection query';
  }

  const fullTable = database ? `${escapeIdentifier(database)}.${escapeIdentifier(table)}` : escapeIdentifier(table);
  const columnExpr = mapKey
    ? `${escapeIdentifier(column)}['${escapeStringContent(mapKey)}']`
    : escapeIdentifier(column);
  const groupByCol = escapeIdentifier(groupBy || 'ServiceName');
  const displayLabel = escapeStringContent(mapKey ? `${column}.${mapKey}` : column);

  return [
    'SELECT',
    '  time,',
    `  ${groupByCol} AS tags,`,
    `  concat(${groupByCol}, ': ${displayLabel} changed to ', version,`,
    `    if(prev_version != '', concat(' (was ', prev_version, ')'), '')) AS text,`,
    `  '${displayLabel} change' AS title`,
    'FROM (',
    '  SELECT',
    '    toStartOfInterval(Timestamp, INTERVAL 30 second) AS time,',
    `    ${groupByCol},`,
    `    topK(1)(${columnExpr})[1] AS version,`,
    `    lagInFrame(topK(1)(${columnExpr})[1])`,
    `      OVER (PARTITION BY ${groupByCol} ORDER BY time) AS prev_version`,
    `  FROM ${fullTable}`,
    '  WHERE $__timeFilter(Timestamp)',
    `    AND ${columnExpr} != ''`,
    `  GROUP BY ${groupByCol}, time`,
    `  ORDER BY ${groupByCol}, time`,
    ')',
    "WHERE prev_version != '' AND prev_version != version",
    'ORDER BY time',
  ].join('\n');
}

const PRESET_OPTIONS = [
  { label: 'Custom SQL', value: 'custom' as AnnotationPreset, description: 'Write your own annotation query' },
  {
    label: 'Change Detection',
    value: 'change_detection' as AnnotationPreset,
    description: 'Detect when a column value changes (deployments, config changes, rollbacks)',
    icon: 'rocket',
  },
];

/** Annotation query editor with a preset selector and a change-detection builder. */
const AnnotationQueryEditor = (props: AnnotationEditorProps) => {
  const { annotation, onAnnotationChange, datasource } = props;
  const anno: CHAnnotationQuery = annotation ?? DEFAULT_ANNOTATION;
  const preset = anno.preset || 'custom';
  const cd: ChangeDetectionState = useMemo(() => anno.changeDetection || {}, [anno.changeDetection]);
  const styles = useStyles2(getStyles);

  // Reuse the shared column hook for the group-by picker.
  const columns = useColumns(datasource, cd.database || '', cd.table || '');

  const updateChangeDetection = useCallback(
    (updates: Partial<ChangeDetectionState>) => {
      if (!onAnnotationChange) {
        return;
      }
      const newCd = { ...cd, ...updates };
      onAnnotationChange({
        ...anno,
        preset: 'change_detection',
        changeDetection: newCd,
        target: buildTarget(anno.target, generateChangeDetectionSQL(newCd)),
      });
    },
    [anno, cd, onAnnotationChange]
  );

  const onSchemaChange = useCallback(
    (schemaValue: SchemaPickerValue) => {
      updateChangeDetection(schemaValue);
    },
    [updateChangeDetection]
  );

  const onPresetChange = useCallback(
    (value: AnnotationPreset) => {
      if (!onAnnotationChange) {
        return;
      }
      const next: CHAnnotationQuery = { ...anno, preset: value };
      if (value === 'change_detection') {
        next.target = buildTarget(anno.target, generateChangeDetectionSQL(cd));
      } else {
        next.target = buildTarget(anno.target, anno.target?.rawSql || '');
      }
      onAnnotationChange(next);
    },
    [anno, cd, onAnnotationChange]
  );

  const onSqlChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (!onAnnotationChange) {
        return;
      }
      onAnnotationChange({
        ...anno,
        target: buildTarget(anno.target, e.currentTarget.value),
      });
    },
    [anno, onAnnotationChange]
  );

  const groupByOptions = [
    { label: 'ServiceName', value: 'ServiceName' },
    ...columns
      .filter((c) => !c.type.startsWith('Map(') && c.name !== 'Timestamp' && c.name !== cd.column)
      .map((c) => ({ label: c.name, value: c.name })),
  ];

  return (
    <div>
      <div className="gf-form" style={{ marginBottom: 8 }}>
        <InlineFormLabel width={10} tooltip="Select an annotation preset or write custom SQL">
          Annotation Type
        </InlineFormLabel>
        <Select
          width={40}
          options={PRESET_OPTIONS}
          value={preset}
          onChange={(v) => onPresetChange(v.value || 'custom')}
        />
      </div>

      {preset === 'change_detection' && (
        <>
          <SchemaPicker
            datasource={datasource}
            value={cd}
            onChange={onSchemaChange}
            level="mapKey"
            labels={{ column: 'Watch Column', mapKey: 'Map Key' }}
          />

          {cd.column && (
            <div className="gf-form" style={{ marginBottom: 4 }}>
              <InlineFormLabel
                width={10}
                tooltip="Group changes by this column. Each unique value is tracked independently."
              >
                Group By
              </InlineFormLabel>
              <Select
                width={30}
                options={groupByOptions}
                value={cd.groupBy || 'ServiceName'}
                onChange={(v) => updateChangeDetection({ groupBy: v.value || 'ServiceName' })}
              />
            </div>
          )}
        </>
      )}

      <div className="gf-form" style={{ marginBottom: 4 }}>
        <InlineFormLabel width={10}>SQL Query</InlineFormLabel>
        <TextArea
          className={styles.sqlInput}
          rows={8}
          value={anno.target?.rawSql || ''}
          onChange={onSqlChange}
          placeholder="SELECT Timestamp AS time, Body AS text, ServiceName AS tags FROM otel_logs WHERE $__timeFilter(Timestamp)"
        />
      </div>

      <div className={styles.helpText}>
        {preset === 'change_detection'
          ? 'Annotations appear when the watched value changes per group, including rollbacks.'
          : 'Return columns: time (required), text, title, tags. Standard Grafana annotation mapping.'}
      </div>
    </div>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  sqlInput: css({
    fontFamily: theme.typography.fontFamilyMonospace,
    fontSize: theme.typography.bodySmall.fontSize,
  }),
  helpText: css({
    color: theme.colors.text.secondary,
    fontSize: theme.typography.bodySmall.fontSize,
    marginLeft: 88,
    marginBottom: theme.spacing(1),
  }),
});

/** Build the AnnotationSupport object wired into the datasource. */
export function createAnnotationSupport(datasource: Datasource): AnnotationSupport<CHQuery> {
  return {
    prepareAnnotation: (json: AnnotationQuery<CHQuery>): AnnotationQuery<CHQuery> => {
      // Legacy dashboards stored the SQL as a top-level `rawQuery` string. Migrate
      // it into the modern target shape once. `rawQuery` is read via the
      // AnnotationQuery index signature, so no cast is needed.
      const legacyRawQuery: string | undefined = json?.rawQuery;
      if (legacyRawQuery && !json?.target?.rawSql) {
        return {
          ...json,
          target: buildTarget(json.target, legacyRawQuery),
        };
      }
      return json;
    },

    getDefaultQuery: (): Partial<CHQuery> => {
      const { database, table } = resolveTraceSchema(datasource);
      return {
        editorType: EditorType.SQL,
        rawSql: generateChangeDetectionSQL({
          database,
          table,
          column: 'ResourceAttributes',
          mapKey: 'service.version',
          groupBy: 'ServiceName',
        }),
        refId: ANNOTATION_REF_ID,
      };
    },

    QueryEditor: AnnotationQueryEditor,
  };
}
