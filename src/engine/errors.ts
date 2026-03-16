/**
 * Structured error types for the HTML report engine.
 *
 * All errors carry a machine-readable code for reliable error handling
 * in MCP tool responses.
 */

export const ErrorCode = {
  FILE_NOT_FOUND: "FILE_NOT_FOUND",
  FILE_READ_ERROR: "FILE_READ_ERROR",
  FILE_WRITE_ERROR: "FILE_WRITE_ERROR",
  INVALID_DOCUMENT: "INVALID_DOCUMENT",
  INDEX_OUT_OF_RANGE: "INDEX_OUT_OF_RANGE",
  INVALID_PARAMETER: "INVALID_PARAMETER",
  INVALID_BLOCK_TYPE: "INVALID_BLOCK_TYPE",
  RENDER_ERROR: "RENDER_ERROR",
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

export class EngineError extends Error {
  constructor(
    public readonly code: ErrorCodeType,
    message: string,
  ) {
    super(message);
    this.name = "EngineError";
  }
}
