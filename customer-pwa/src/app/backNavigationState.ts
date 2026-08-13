export const BACK_GUARD_STATE_KEY = '__priceWatchBackGuard';

export interface BackGuardState {
  [BACK_GUARD_STATE_KEY]: true;
  basePath: string;
}

export function isBackGuardState(value: unknown): value is BackGuardState {
  return typeof value === 'object'
    && value !== null
    && (value as Partial<BackGuardState>)[BACK_GUARD_STATE_KEY] === true;
}
