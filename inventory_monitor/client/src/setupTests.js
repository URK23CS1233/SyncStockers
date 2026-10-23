import '@testing-library/jest-dom';
import { TextEncoder, TextDecoder } from 'util';

// react-router v7 references TextEncoder at import time; jsdom (Jest 27) lacks it.
if (typeof global.TextEncoder === 'undefined') {
  global.TextEncoder = TextEncoder;
}
if (typeof global.TextDecoder === 'undefined') {
  global.TextDecoder = TextDecoder;
}
