import '@testing-library/jest-dom';
import '@testing-library/jest-dom/extend-expect';

process.on('unhandledRejection', (err) => {
  console.warn(err);
});
