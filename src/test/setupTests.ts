import '@testing-library/jest-dom';
import '@testing-library/jest-dom/extend-expect';

// workaround
process.on('unhandledRejection', listener)

function listener() {}