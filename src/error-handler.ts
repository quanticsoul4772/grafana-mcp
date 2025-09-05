/**
 * Centralized error handling for MCP tool handlers
 */

import {
  categorizeError,
  formatUserError,
  formatInternalError,
  ErrorCategory,
} from "./security-utils.js";

/**
 * MCP tool response interface
 */
interface ToolResponse {
  content: Array<{
    type: "text";
    text: string;
  }>;
  isError?: boolean;
}

/**
 * Handle errors consistently across all tool handlers
 *
 * @param error - The error to handle
 * @param toolName - Name of the tool for logging context
 * @param operation - The operation being performed (optional)
 * @returns Formatted MCP tool response
 */
export function handleToolError(
  error: any,
  toolName: string,
  operation?: string,
): ToolResponse {
  const context = operation ? `${toolName}:${operation}` : toolName;
  const categorizedError = categorizeError(error, context);

  // Log the full internal error details for debugging
  console.error(`[Tool Error] ${formatInternalError(categorizedError)}`);

  // Return safe user message
  const userMessage = formatUserError(categorizedError);

  // Add helpful context based on error category
  let contextualMessage = userMessage;

  switch (categorizedError.category) {
    case ErrorCategory.USER_ERROR:
      // User errors are safe to show with additional context
      contextualMessage = `${userMessage}\\n\\nOperation: ${toolName}`;
      break;

    case ErrorCategory.NETWORK_ERROR:
      contextualMessage = `${userMessage}\\n\\nPlease verify:\\n- Grafana server is running\\n- GRAFANA_URL is correct\\n- Network connectivity is available`;
      break;

    case ErrorCategory.VALIDATION_ERROR:
      contextualMessage = `${userMessage}\\n\\nPlease check the parameters you provided and refer to the tool documentation.`;
      break;

    case ErrorCategory.SYSTEM_ERROR:
    default:
      // Keep system errors generic for security
      contextualMessage = `${userMessage}\\n\\nIf this problem persists, please check the server logs for more details.`;
      break;
  }

  return {
    content: [
      {
        type: "text",
        text: contextualMessage,
      },
    ],
    isError: true,
  };
}

/**
 * Wrapper for tool handler functions to provide consistent error handling
 *
 * @param toolName - Name of the tool
 * @param operation - The operation being performed
 * @param handler - The actual tool logic function
 * @returns Promise that resolves to a formatted MCP tool response
 */
export function withErrorHandling(
  toolName: string,
  operation: string,
  handler: () => Promise<ToolResponse>,
): Promise<ToolResponse> {
  return handler().catch((error) =>
    handleToolError(error, toolName, operation),
  );
}

/**
 * Create a standardized success response
 *
 * @param message - Success message to display
 * @returns Formatted MCP tool response
 */
export function createSuccessResponse(message: string): ToolResponse {
  return {
    content: [
      {
        type: "text",
        text: message,
      },
    ],
  };
}

/**
 * Validate required parameters and throw user-friendly errors
 *
 * @param params - Parameters object to validate
 * @param requiredFields - Array of required field names
 * @param toolName - Name of the tool for error context
 */
export function validateRequiredParams(
  params: any,
  requiredFields: string[],
  _toolName: string,
): void {
  const missing = requiredFields.filter((field) => !params[field]);

  if (missing.length > 0) {
    const error = new Error(
      `Missing required parameters: ${missing.join(", ")}`,
    );
    error.name = "ValidationError";
    throw error;
  }
}
