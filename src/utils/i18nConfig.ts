export const I18N_LOCALES = ['en', 'ro'] as const;
export const I18N_DEFAULT_LOCALE = 'en';

export type I18nLocale = (typeof I18N_LOCALES)[number];
