/**
 * `@certifine/web-kit` — front-end only. Nothing here has a backend consumer.
 *
 * It deliberately does NOT re-export `@certifine/domain`. It did during the
 * P1 transition so 112 call sites could keep their imports; that shim was
 * removed before the repo split, because once these are separate repos a
 * pass-through would mean the WEB package appears to own the backend's rules.
 * Import business rules straight from `@certifine/domain`.
 */
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
