import '@testing-library/jest-dom';
import '@testing-library/jest-dom/extend-expect';

// workaround for warnings
process.on('unhandledRejection', () => {})
