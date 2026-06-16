// Jest setup provided by Grafana scaffolding
import './.config/jest-setup';
import { TextEncoder, TextDecoder } from 'util';

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

const mockIntersectionObserver = jest.fn().mockImplementation((arg) => ({
  observe: jest.fn().mockImplementation((elem) => {
    arg([{ target: elem, isIntersecting: true }]);
  }),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

global.IntersectionObserver = mockIntersectionObserver;
