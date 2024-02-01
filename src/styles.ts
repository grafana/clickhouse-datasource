import { css } from '@emotion/css';

export const styles = {
  Common: {
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
    `
  },
  FormatSelector: {
    formatSelector: css`
      display: flex;
    `,
  },
  VariablesEditor: {},
};
