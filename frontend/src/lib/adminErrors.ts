import { ApiError } from "./api";

const ADMIN_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const ADMIN_ITEM_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const ADMIN_OPTION_LABEL_PATTERN = /^[A-Z]$/;

const COMMON_ADMIN_ERROR_MESSAGES: Record<string, string> = {
  "Тема не найдена": "Выбранная тема не найдена. Обнови страницу и выбери тему заново.",
  "Вопрос не найден": "Вопрос не найден. Возможно, он уже был удален или изменен.",
  "Кейс не найден": "Кейс не найден. Возможно, он уже был удален или изменен.",
  "Станция ОСКЭ не найдена": "Станция ОСКЭ не найдена. Возможно, она уже была удалена или изменена.",
  "Метки вариантов ответа должны быть уникальными": "Метки вариантов ответа должны быть уникальными.",
  "У вопроса должен быть ровно один правильный вариант ответа":
    "У вопроса должен быть ровно один правильный вариант ответа.",
  "Slug кейса должен содержать только строчные латинские буквы, цифры и дефис":
    "Slug кейса должен содержать только строчные латинские буквы, цифры и дефис.",
  "Slug станции ОСКЭ должен содержать только строчные латинские буквы, цифры и дефис":
    "Slug станции ОСКЭ должен содержать только строчные латинские буквы, цифры и дефис.",
  "Id пунктов чек-листа ОСКЭ должны быть уникальными": "Id пунктов чек-листа ОСКЭ должны быть уникальными.",
  "Id вопросов ОСКЭ должны быть уникальными": "Id вопросов ОСКЭ должны быть уникальными.",
  "Метки вариантов ответа ОСКЭ должны быть уникальными":
    "Метки вариантов ответа внутри одного вопроса должны быть уникальными.",
  "Правильная метка ответа ОСКЭ должна совпадать с одним из вариантов":
    "Правильный вариант должен совпадать с одной из меток ответа.",
};

interface AdminApiErrorOptions {
  conflictMessage?: string;
  detailMap?: Record<string, string>;
}

export function isValidAdminSlug(value: string): boolean {
  return ADMIN_SLUG_PATTERN.test(value);
}

export function isValidAdminItemId(value: string): boolean {
  return ADMIN_ITEM_ID_PATTERN.test(value);
}

export function isValidAdminOptionLabel(value: string): boolean {
  return ADMIN_OPTION_LABEL_PATTERN.test(value);
}

export function getAdminApiErrorMessage(
  error: unknown,
  fallbackMessage: string,
  options: AdminApiErrorOptions = {},
): string {
  if (!(error instanceof ApiError)) {
    return fallbackMessage;
  }

  const detailMap = {
    ...COMMON_ADMIN_ERROR_MESSAGES,
    ...options.detailMap,
  };

  if (detailMap[error.message]) {
    return detailMap[error.message];
  }

  if ((error.code === "conflict" || error.status === 409) && options.conflictMessage) {
    return options.conflictMessage;
  }

  return error.message || fallbackMessage;
}
