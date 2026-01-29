// Jest setup file for ES modules
// This file captures console output and only shows it for failing tests

import { beforeEach, afterEach } from '@jest/globals';

const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;

let testLogs = [];

// Capture all console output during tests
beforeEach(() => {
  testLogs = [];
  
  console.log = (...args) => {
    testLogs.push({ level: 'log', args });
  };
  
  console.warn = (...args) => {
    testLogs.push({ level: 'warn', args });
  };
  
  console.error = (...args) => {
    testLogs.push({ level: 'error', args });
  };
});

// Show logs only if test failed
afterEach(() => {
  // Restore original console methods
  console.log = originalLog;
  console.warn = originalWarn;
  console.error = originalError;
  
  // Check if test failed by examining Jest's test state
  if (testLogs.length > 0) {
    try {
      // Access Jest's expect state to check if test failed
      const state = expect.getState();
      const testResults = state.testResults || [];
      const lastResult = testResults[testResults.length - 1];
      
      // If the last test result shows failure, display the logs
      if (lastResult && lastResult.status === 'failed') {
        const testName = lastResult.fullName || state.currentTestName || 'Unknown test';
        originalLog(`\n${'='.repeat(70)}`);
        originalLog(`Console output for FAILING test: ${testName}`);
        originalLog('='.repeat(70));
        testLogs.forEach(({ level, args }) => {
          if (level === 'log') originalLog(...args);
          else if (level === 'warn') originalWarn(...args);
          else if (level === 'error') originalError(...args);
        });
        originalLog('='.repeat(70) + '\n');
      }
    } catch (e) {
      // If we can't determine test status, don't show logs
    }
  }
  
  testLogs = [];
});
