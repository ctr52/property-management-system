/**
 * Доменные/прикладные ошибки. Возвращаются через neverthrow `Result`, не через throw.
 */
export type AppError =
  | { readonly kind: 'validation'; readonly message: string }
  | { readonly kind: 'not_found'; readonly message: string }
  | { readonly kind: 'conflict'; readonly message: string }
  | { readonly kind: 'unauthorized'; readonly message: string }
  | { readonly kind: 'forbidden'; readonly message: string };

export const validationError = (message: string): AppError => ({ kind: 'validation', message });
export const notFoundError = (message: string): AppError => ({ kind: 'not_found', message });
export const conflictError = (message: string): AppError => ({ kind: 'conflict', message });
export const unauthorizedError = (message: string): AppError => ({ kind: 'unauthorized', message });
export const forbiddenError = (message: string): AppError => ({ kind: 'forbidden', message });

/** HTTP-статус по типу ошибки — для тонкого слоя роутов. */
export const httpStatusForError = (error: AppError): 400 | 401 | 403 | 404 | 409 => {
  switch (error.kind) {
    case 'validation':
      return 400;
    case 'unauthorized':
      return 401;
    case 'forbidden':
      return 403;
    case 'not_found':
      return 404;
    case 'conflict':
      return 409;
  }
};
