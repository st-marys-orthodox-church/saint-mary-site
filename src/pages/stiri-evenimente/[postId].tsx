import type { GetServerSideProps } from 'next';
import { useTranslation } from 'next-i18next/pages';
import { serverSideTranslations } from 'next-i18next/pages/serverSideTranslations';
import Link from 'next/link';
import { Meta } from '../../ui/base/Meta';
import { Template } from '../../ui/base/Template';
import { type NewsPost, getNewsPostById } from '../../utils/NewsPosts';
import { I18N_DEFAULT_LOCALE } from '../../utils/i18nConfig';

type NewsPostDetailPageProps = {
  post: NewsPost | null;
};

const NewsPostDetailPage = ({ post }: NewsPostDetailPageProps) => {
  const { t, i18n } = useTranslation('newsFeed');
  const locale = i18n.language;

  if (!post) {
    return (
      <div className="bg-stone-50 text-stone-800 antialiased">
        <Meta title={t('notFoundTitle')} description={t('notFoundBody')} />
        <Template topPad>
          <section className="mx-auto max-w-3xl px-4 py-20">
            <Link
              href="/stiri-evenimente"
              className="text-sm font-medium uppercase tracking-[0.18em] text-brand-green transition-colors duration-300 hover:text-brand-gold"
            >
              ← {t('backToNews')}
            </Link>
            <div className="mt-8 rounded-sm border border-stone-200 bg-white px-8 py-10 shadow-[0_24px_54px_-42px_rgba(28,25,23,0.45)]">
              <h1 className="text-3xl text-stone-900">{t('notFoundTitle')}</h1>
              <p className="mt-4 text-base leading-8 text-stone-600">{t('notFoundBody')}</p>
            </div>
          </section>
        </Template>
      </div>
    );
  }

  return (
    <div className="bg-stone-50 text-stone-800 antialiased">
      <Meta title={post.title} description={post.excerpt || post.message} />
      <Template topPad>
        <section className="relative overflow-hidden py-20 md:py-24">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(124,152,133,0.08),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(201,168,108,0.1),_transparent_28%)]" />

          <div className="relative mx-auto max-w-4xl px-4">
            <Link
              href="/stiri-evenimente"
              className="text-sm font-medium uppercase tracking-[0.18em] text-brand-green transition-colors duration-300 hover:text-brand-gold"
            >
              ← {t('backToNews')}
            </Link>

            <article className="mt-8 overflow-hidden rounded-sm border border-stone-200 bg-white shadow-[0_24px_54px_-42px_rgba(28,25,23,0.45)]">
              {post.imageUrl ? (
                <div className="aspect-[16/9] overflow-hidden bg-stone-200">
                  <img
                    src={post.imageUrl}
                    alt={post.title}
                    className="h-full w-full object-cover"
                  />
                </div>
              ) : null}

              <div className="px-6 py-6 md:px-10 md:py-10">
                <div className="flex flex-wrap items-center gap-4 text-xs uppercase tracking-[0.18em] text-stone-500">
                  <span>{t('fullPostEyebrow')}</span>
                  <span>
                    {new Intl.DateTimeFormat(locale, {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    }).format(new Date(post.createdAt))}
                  </span>
                </div>

                <h1 className="mt-5 text-4xl text-stone-900 md:text-5xl">{post.title}</h1>

                <div className="mt-8 whitespace-pre-line text-base leading-8 text-stone-700">
                  {post.message || post.excerpt}
                </div>

                {post.externalUrl ? (
                  <div className="mt-8">
                    <Link
                      href={post.externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center rounded-sm border border-brand-green px-6 py-3 text-sm font-medium uppercase tracking-[0.18em] text-brand-green transition-colors duration-300 hover:border-brand-gold hover:text-brand-gold"
                    >
                      {t('viewExternalLink')}
                    </Link>
                  </div>
                ) : null}
              </div>
            </article>
          </div>
        </section>
      </Template>
    </div>
  );
};

export const getServerSideProps: GetServerSideProps<NewsPostDetailPageProps> = async ({
  locale,
  params,
}) => {
  const postId = typeof params?.postId === 'string' ? decodeURIComponent(params.postId) : '';
  const post = postId ? getNewsPostById(postId) : null;

  return {
    props: {
      ...(await serverSideTranslations(locale ?? I18N_DEFAULT_LOCALE, ['common', 'newsFeed'])),
      post,
    },
  };
};

export default NewsPostDetailPage;
