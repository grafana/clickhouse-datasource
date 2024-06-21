import React, {ChangeEvent, useState} from 'react';
import {ConfigSection} from 'components/experimental/ConfigSection';
import {Input, Field, HorizontalGroup, Button} from '@grafana/ui';
import {AliasTableEntry} from 'types/config';
import allLabels from 'labels';
import {styles} from 'styles';
import {selectors as allSelectors} from 'selectors';

interface AliasTablesConfigProps {
    aliasTables?: AliasTableEntry[];
    onAliasTablesChange: (v: AliasTableEntry[]) => void;
}

export const AliasTableConfig = (props: AliasTablesConfigProps) => {
    const {onAliasTablesChange} = props;
    const [entries, setEntries] = useState<AliasTableEntry[]>(props.aliasTables || []);
    const labels = allLabels.components.Config.AliasTableConfig;
    const selectors = allSelectors.components.Config.AliasTableConfig;

    const entryToUniqueKey = (entry: AliasTableEntry) => `"${entry.targetDatabase}"."${entry.targetTable}":"${entry.aliasDatabase}"."${entry.aliasTable}"`;
    const removeDuplicateEntries = (entries: AliasTableEntry[]): AliasTableEntry[] => {
        const duplicateKeys = new Set();
        return entries.filter(entry => {
            const key = entryToUniqueKey(entry);
            if (duplicateKeys.has(key)) {
                return false;
            }

            duplicateKeys.add(key);
            return true;
        });
    };

    const addEntry = () => {
        setEntries(removeDuplicateEntries([...entries, {
            targetDatabase: '',
            targetTable: '',
            aliasDatabase: '',
            aliasTable: ''
        }]));
    }
    const removeEntry = (index: number) => {
        let nextEntries: AliasTableEntry[] = entries.slice();
        nextEntries.splice(index, 1);
        nextEntries = removeDuplicateEntries(nextEntries);
        setEntries(nextEntries);
        onAliasTablesChange(nextEntries);
    };
    const updateEntry = (index: number, entry: AliasTableEntry) => {
        let nextEntries: AliasTableEntry[] = entries.slice();
        entry.targetDatabase = entry.targetDatabase.trim();
        entry.targetTable = entry.targetTable.trim();
        entry.aliasDatabase = entry.aliasDatabase.trim();
        entry.aliasTable = entry.aliasTable.trim();
        nextEntries[index] = entry;

        nextEntries = removeDuplicateEntries(nextEntries);
        setEntries(nextEntries);
        onAliasTablesChange(nextEntries);
    };

    return (
        <ConfigSection
            title={labels.title}
        >
            <div>
                <span>{labels.descriptionParts[0]}</span>
                <code>{labels.descriptionParts[1]}</code>
                <span>{labels.descriptionParts[2]}</span>
            </div>
            <br/>

            {entries.map((entry, index) => (
                <AliasTableEditor
                    key={entryToUniqueKey(entry)}
                    targetDatabase={entry.targetDatabase}
                    targetTable={entry.targetTable}
                    aliasDatabase={entry.aliasDatabase}
                    aliasTable={entry.aliasTable}
                    onEntryChange={e => updateEntry(index, e)}
                    onRemove={() => removeEntry(index)}
                />
            ))}
            <Button
                data-testid={selectors.addEntryButton}
                icon="plus-circle"
                variant="secondary"
                size="sm"
                onClick={addEntry}
                className={styles.Common.smallBtn}
            >
                {labels.addTableLabel}
            </Button>
        </ConfigSection>
    );
}

interface AliasTableEditorProps {
    targetDatabase: string;
    targetTable: string;
    aliasDatabase: string;
    aliasTable: string;
    onEntryChange: (v: AliasTableEntry) => void;
    onRemove?: () => void;
}

const AliasTableEditor = (props: AliasTableEditorProps) => {
    const {onEntryChange, onRemove} = props;
    const [targetDatabase, setTargetDatabase] = useState<string>(props.targetDatabase);
    const [targetTable, setTargetTable] = useState<string>(props.targetTable);
    const [aliasDatabase, setAliasDatabase] = useState<string>(props.aliasDatabase);
    const [aliasTable, setAliasTable] = useState<string>(props.aliasTable);
    const labels = allLabels.components.Config.AliasTableConfig;
    const selectors = allSelectors.components.Config.AliasTableConfig;

    const onUpdate = () => {
        onEntryChange({targetDatabase, targetTable, aliasDatabase, aliasTable});
    }

    return (
        <div data-testid={selectors.aliasEditor}>
            <HorizontalGroup>
                <Field label={labels.targetDatabaseLabel} aria-label={labels.targetDatabaseLabel}>
                    <Input
                        data-testid={selectors.targetDatabaseInput}
                        value={targetDatabase}
                        placeholder={labels.targetDatabasePlaceholder}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setTargetDatabase(e.target.value)}
                        onBlur={() => onUpdate()}
                    />
                </Field>
                <Field label={labels.targetTableLabel} aria-label={labels.targetTableLabel}>
                    <Input
                        data-testid={selectors.targetTableInput}
                        value={targetTable}
                        placeholder={labels.targetTableLabel}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setTargetTable(e.target.value)}
                        onBlur={() => onUpdate()}
                    />
                </Field>
                <Field label={labels.aliasDatabaseLabel} aria-label={labels.aliasDatabaseLabel}>
                    <Input
                        data-testid={selectors.aliasDatabaseInput}
                        value={aliasDatabase}
                        placeholder={labels.aliasDatabasePlaceholder}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setAliasDatabase(e.target.value)}
                        onBlur={() => onUpdate()}
                    />
                </Field>
                <Field label={labels.aliasTableLabel} aria-label={labels.aliasTableLabel}>
                    <Input
                        data-testid={selectors.aliasTableInput}
                        value={aliasTable}
                        placeholder={labels.aliasTableLabel}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setAliasTable(e.target.value)}
                        onBlur={() => onUpdate()}
                    />
                </Field>
                {onRemove &&
                    <Button
                        data-testid={selectors.removeEntryButton}
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
