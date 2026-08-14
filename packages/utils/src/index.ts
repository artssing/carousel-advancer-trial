/**
 * Re-exports `@certifine/domain` so existing `@authentik/utils` imports keep
 * working while the boundary is proven inside the monorepo (repo-split P1).
 * The web may import either; the API must import domain directly.
 */
export * from '@certifine/domain';

export * from './money';
export * from './categories';
export * from './brands';
export * from './search';
export * from './order-status';
export * from './districts';
export * from './chat-time';
export * from './prices';
export * from './conditions';
export * from './mtr';
export * from './shipping';
export * from './locales';
export * from './chat-preview';
