import { css } from '@emotion/css';

export const styles = {
  Common: {
    // Replicates the layout of the removed `.gf-form` global class
    // (grafana/grafana#65513) so rows keep their exact look without it.
    // Applied on top of InlineFieldRow, whose only conflicting property is
    // flex-wrap; `&&` doubles specificity so these values always win.
    formRow: css`
      label: form-row;
      && {
        display: flex;
        flex-direction: row;
        flex-wrap: nowrap;
        align-items: flex-start;
        text-align: left;
        position: relative;
        margin-bottom: 4px;
      }
    `,
    // Same replacement for the grafana-ui Switch controls that carried the
    // gf-form class. Switch puts the className on its inner <input>, whose own
    // `position: absolute` used to win the cascade against gf-form — so this
    // variant omits `position` (and the specificity boost) to keep that intact.
    formRowSwitch: css`
      label: form-row-switch;
      display: flex;
      flex-direction: row;
      align-items: flex-start;
      text-align: left;
      margin-bottom: 4px;
    `,
    check: css`
      margin-top: 5px;
    `,
    wrapper: css`
      position: relative;
      width: 100%;
    `,
    smallBtn: css`
      margin-top: 5px;
      margin-inline: 5px;
    `,
    selectWrapper: css`
      width: 100%;
    `,
    inlineSelect: css`
      margin-right: 5px;
    `,
    firstLabel: css`
      margin-right: 5px;
    `,
    expand: css`
      position: absolute;
      top: 2px;
      left: 6px;
      z-index: 100;
      color: gray;
    `,
  },
  ConfigEditor: {
    container: css`
      justify-content: space-between;
      h5 {
        line-height: 34px;
        margin-bottom: 5px;
      }
      button {
        margin-right: 5px;
      }
    `,
    wide: css`
      width: 75%;
    `,
    subHeader: css`
      padding: 5px 0 5px 0;
    `,
  },
  QueryEditor: {
    queryType: css`
      justify-content: space-between;
      span {
        display: flex;
      }
    `,
    inlineField: css`
      margin-left: 7px;
    `,
  },
  FormatSelector: {
    formatSelector: css`
      display: flex;
    `,
  },
  VariablesEditor: {},
};
