import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";
import { errorResponse } from "../utils/response";

type RequestPart = "body" | "query" | "params";

/**
 * Validates a request against a Zod schema.
 * The schema should be an object with optional keys: body, query, params.
 *
 * Example:
 *   const schema = z.object({ body: z.object({ email: z.string().email() }) })
 *   router.post('/login', validate(schema), handler)
 */
export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse({
      body: req.body,
      query: req.query,
      params: req.params,
    });

    if (!result.success) {
      const errors = formatZodErrors(result.error);
      errorResponse(res, 400, "VALIDATION_ERROR", "Validation failed", errors);
      return;
    }

    // Assign validated/transformed data back to request
    const data = result.data as Record<string, unknown>;
    (["body", "query", "params"] as RequestPart[]).forEach((part) => {
      if (data[part]) (req as any)[part] = data[part];
    });

    next();
  };
}

function formatZodErrors(error: ZodError): Record<string, string[]> {
  const formatted: Record<string, string[]> = {};

  for (const issue of error.issues) {
    // Remove leading "body." / "query." / "params." from path
    const path = issue.path
      .filter((p) => p !== "body" && p !== "query" && p !== "params")
      .join(".");

    const key = path || "root";
    if (!formatted[key]) formatted[key] = [];
    formatted[key].push(issue.message);
  }

  return formatted;
}
