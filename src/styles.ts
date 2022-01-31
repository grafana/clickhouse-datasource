import { css } from 'emotion';

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
    run: css`
      position: absolute;
      top: -1px;
      left: 6px;
      z-index: 100;
      color: green;
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
  },
  VariablesEditor: {},
};
