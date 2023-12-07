import { css } from '@emotion/css';

export const styles = {
  Common: {
    wrapper: css`
      position: relative;
      width: 100%;
    `,
    smallBtn: css`
      margin-top: 5px;
      margin-inline: 5px;
    `,
    inlineSelect: css`
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
};
