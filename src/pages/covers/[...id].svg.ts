import type { APIRoute } from 'astro';
import { posts } from '../../lib/site';
import { renderPostCover } from '../../lib/post-cover';

export const prerender = true;

// Use the same publication filter and stable IDs as the article routes.
// Also generate a fallback for articles that specify their own cover image.
export async function getStaticPaths() {
  return (await posts()).map(post => ({ params: { id: post.id }, props: { post } }));
}

export const GET: APIRoute = ({ props }) => new Response(renderPostCover(props.post), {
  headers: { 'Content-Type': 'image/svg+xml; charset=utf-8' }
});
