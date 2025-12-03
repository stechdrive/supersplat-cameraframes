import i18next from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import Backend from 'i18next-http-backend';

const localizeInit = () => {
    return i18next
    .use(Backend)
    .use(LanguageDetector)
    .init({
        detection: {
            order: ['querystring', /* 'cookie', 'localStorage', 'sessionStorage',*/ 'navigator', 'htmlTag']
        },
        backend: {
            loadPath: './static/locales/{{lng}}.json'
        },
        supportedLngs: ['de', 'en', 'es', 'fr', 'ja', 'ko', 'pt-BR', 'ru', 'zh-CN'],
        fallbackLng: 'en',
        interpolation: {
            escapeValue: false
        }
    });
};

interface LocalizeOptions {
    ellipsis?: boolean;
    // additional properties are passed to i18next for interpolation
    [key: string]: any;
}

const localize = (key: string, options?: LocalizeOptions): string => {
    const { ellipsis, ...interpolation } = options ?? {};
    const text = i18next.t(key, interpolation) as string;

    return ellipsis ? `${text}...` : text;
};

const getLocale = (): string => {
    return i18next.language || 'en';
};

const formatInteger = (value: number): string => {
    return new Intl.NumberFormat(getLocale(), {
        maximumFractionDigits: 0
    }).format(Math.round(value));
};

export { localizeInit, localize, formatInteger };
export type { LocalizeOptions };
