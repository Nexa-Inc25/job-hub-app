/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Transaction Utility Tests
 * 
 * Tests MongoDB transaction helpers.
 * Note: In-memory MongoDB doesn't support replica set transactions,
 * so we test the function signatures and error handling.
 */

const { supportsTransactions, withOptionalTransaction } = require('../utils/transaction');

describe('Transaction Utilities', () => {

  describe('supportsTransactions', () => {
    it('should return false for in-memory MongoDB (no replica set)', async () => {
      const supported = await supportsTransactions();
      // mongodb-memory-server runs standalone by default
      expect(supported).toBe(false);
    });
  });

  describe('withOptionalTransaction', () => {
    it('should run function without transaction when not supported', async () => {
      const result = await withOptionalTransaction(async (session) => {
        expect(session).toBeNull();
        return 'result';
      });
      expect(result).toBe('result');
    });

    it('should propagate errors from the function', async () => {
      await expect(
        withOptionalTransaction(async () => {
          throw new Error('Test error');
        })
      ).rejects.toThrow('Test error');
    });

    it('should pass null session to function when transactions not supported', async () => {
      let receivedSession;
      await withOptionalTransaction(async (session) => {
        receivedSession = session;
        return 'ok';
      });
      expect(receivedSession).toBeNull();
    });
  });
});

