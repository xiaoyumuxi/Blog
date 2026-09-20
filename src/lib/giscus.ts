export const giscus = {
  repo: 'xiaoyumuxi/Blog',
  repoId: 'R_kgDOUilOsg',
  category: import.meta.env.PUBLIC_GISCUS_CATEGORY?.trim() || 'Announcements',
  categoryId: import.meta.env.PUBLIC_GISCUS_CATEGORY_ID?.trim() || 'DIC_kwDOUilOss4DGB2R',
};

export const giscusEnabled = Boolean(giscus.categoryId);
