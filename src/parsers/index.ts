import type { ParseResult } from '../types';
import { parseGrowwStocksStatement } from './growwStocks';
import { parseMfCentralStatement } from './mfcentral';
import { parseZerodhaStatement } from './zerodha';

export type ParserInput = {
  platform: 'groww' | 'zerodha' | 'mf_central';
  file: ArrayBuffer;
  nseIsinMap?: Record<string, string>;
};

export function parseByPlatform(input: ParserInput): ParseResult {
  if (input.platform === 'groww') {
    return parseGrowwStocksStatement(input.file, input.nseIsinMap);
  }
  if (input.platform === 'zerodha') {
    return parseZerodhaStatement(input.file);
  }
  if (input.platform === 'mf_central') {
    return parseMfCentralStatement(input.file);
  }

  return {
    transactions: [],
    issues: [{ row: 0, reason: `Parser not implemented for ${input.platform}`, raw: {} }],
  };
}
