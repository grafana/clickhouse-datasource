import { css } from '@emotion/css';

export const styles = {
  Common: {
    check: css({
      marginTop: '5px',
    }),
    wrapper: css({
      position: 'relative',
      width: '100%',
    }),
    smallBtn: css({
      marginTop: '5px',
      marginInline: '5px',
    }),
    selectWrapper: css({
      width: '100%',
    }),
    inlineSelect: css({
      marginRight: '5px',
    }),
    firstLabel: css({
      marginRight: '5px',
    }),
    expand: css({
      position: 'absolute',
      top: '2px',
      left: '6px',
      zIndex: 100,
      color: 'gray',
    }),
    flexContainer: css({
      display: 'flex',
      marginBottom: '4px',
    }),
    flex: css({
      display: 'flex',
    }),
    flexColumn: css({
      display: 'flex',
      flexDirection: 'column',
    }),
  },
  ConfigEditor: {
    container: css({
      justifyContent: 'space-between',
      '& h5': {
        lineHeight: '34px',
        marginBottom: '5px',
      },
      '& button': {
        marginRight: '5px',
      },
    }),
    wide: css({
      width: '75%',
    }),
    subHeader: css({
      padding: '5px 0 5px 0',
    }),
  },
  QueryEditor: {
    queryType: css({
      justifyContent: 'space-between',
      '& span': {
        display: 'flex',
      },
    }),
    inlineField: css({
      marginLeft: '7px',
    }),
  },
  FormatSelector: {
    formatSelector: css({
      display: 'flex',
    }),
  },
  VariablesEditor: {},
};
