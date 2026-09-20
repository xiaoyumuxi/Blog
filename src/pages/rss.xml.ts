import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import {posts,href,site} from '../lib/site';
export async function GET(context:APIContext){
  return rss({title:site.title,description:site.description,site:context.site!,
    items:(await posts()).map(post=>({title:post.data.title,description:post.data.description,pubDate:post.data.date,link:href(`blog/${post.id}/`)})),
    customData:'<language>zh-cn</language>'});
}
