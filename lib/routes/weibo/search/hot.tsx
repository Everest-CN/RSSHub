import { load } from 'cheerio';
import { raw } from 'hono/html';
import { renderToString } from 'hono/jsx/dom/server';

import { config } from '@/config';
import type { DataItem, Route } from '@/types';
import { ViewType } from '@/types';
import cache from '@/utils/cache';
import got from '@/utils/got';

import weiboUtils from '../utils';

// Default hide all picture
let wpic = 'false';
let fullpic = 'false';

export const route: Route = {
    path: '/search/hot/:fulltext?',
    categories: ['social-media'],
    view: ViewType.SocialMedia,
    example: '/weibo/search/hot',
    parameters: {
        fulltext: {
            description: `
-   使用\`/weibo/search/hot\`可以获取热搜条目列表；
-   使用\`/weibo/search/hot/fulltext\`可以进一步获取热搜条目下的摘要信息（不含图片视频）；
-   使用\`/weibo/search/hot/fulltext?pic=true\`可以获取图片缩略（但需要配合额外的手段，例如浏览器上的 Header Editor 等来修改 referer 参数为\`https://weibo.com\`，以规避微博的外链限制，否则图片无法显示。）
-   使用\`/weibo/search/hot/fulltext?pic=true&fullpic=true\`可以获取 Original 图片（但需要配合额外的手段，例如浏览器上的 Header Editor 等来修改 referer 参数为\`https://weibo.com\`，以规避微博的外链限制，否则图片无法显示。）`,
        },
    },
    features: {
        requireConfig: [
            {
                name: 'WEIBO_COOKIES',
                optional: true,
                description: 'WEIBOCN_FROM=1110006030; _T_WM=74572357830; SCF=ApmO_U1d-M95-_OAio63kHC8KP3xjWE7pIbZf0TCpn-YCXOYb2XGqwqxD2WvTEGkY5QSNvAFEHQ95qoDJ5BQFMY.; SUB=_2A25Ex7d8DeRhGeFI7lEU-SnMyjmIHXVnvLa0rDV6PUJbktANLXblkW1NfRF6Ji9_Ajir9sieNEbHTPDc1Szw_JZs; SUBP=0033WrSXqPxfM725Ws9jqgMF55529P9D9WhUXPU21m4MUrDQxhsysui85NHD95QNSo-0SK.Neh2fWs4DqcjMi--NiK.Xi-2Ri--ciKnRi-zNS0qfe0-4S05pSBtt; SSOLoginState=1774438188; ALF=1777030188; MLOGIN=1; XSRF-TOKEN=a16392; mweibo_short_token=7391b4aec5; M_WEIBOCN_PARAMS=luicode%3D10000011%26lfid%3D231583%26launchid%3D10000360-page_H5%26oid%3D5280303912324697%26fid%3D100103type%253D1%2526t%253D10%2526q%253D%2523%25E5%2588%2586%25E6%2589%258B%25E9%2580%258016%25E4%25B8%2587%25E5%25BD%25A9%25E7%25A4%25BC%25E7%2594%25B7%25E6%2596%25B9%25E5%25AB%258C%25E5%25B0%2591%25E5%2586%258D%25E8%25A6%258116.7%25E4%25B8%2587%2523%26uicode%3D10000011',
            },
        ],
        requirePuppeteer: true,
        antiCrawler: false,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    radar: [
        {
            source: ['s.weibo.com/top/summary'],
        },
    ],
    name: '热搜榜',
    maintainers: ['xyqfer', 'shinemoon'],
    handler,
    url: 's.weibo.com/top/summary',
};

async function handler(ctx) {
    wpic = ctx.req.query('pic') ?? 'false';
    fullpic = ctx.req.query('fullpic') ?? 'false';
    const {
        data: { data },
    } = await weiboUtils.tryWithCookies(async (cookies, verifier) => {
        const _r = await got({
            method: 'get',
            url: 'https://m.weibo.cn/api/container/getIndex?containerid=106003type%3D25%26t%3D3%26disable_hot%3D1%26filter_type%3Drealtimehot&title=%E5%BE%AE%E5%8D%9A%E7%83%AD%E6%90%9C&extparam=filter_type%3Drealtimehot%26mi_cid%3D100103%26pos%3D0_0%26c_type%3D30%26display_time%3D1540538388&luicode=10000011&lfid=231583',
            headers: {
                Referer: 'https://s.weibo.com/top/summary?cate=realtimehot',
                Cookie: cookies,
                ...weiboUtils.apiHeaders,
            },
        });
        verifier(_r);
        return _r;
    });

    let resultItems: DataItem[];
    if (ctx.req.param('fulltext') === 'fulltext') {
        const cardslist = data.cards[0].card_group;
        // Topic List
        const tlist = cardslist.map((item) => {
            const title = item.desc;
            const link = `https://m.weibo.cn/search?containerid=100103type%3D1%26q%3D${encodeURIComponent(item.desc)}`;
            const plink = `https://m.weibo.cn/api/container/getIndex?containerid=100103type%3D1%26q%3D${encodeURIComponent(item.desc)}`;
            return {
                title,
                link,
                plink,
            };
        });

        resultItems = await Promise.all(
            tlist.map((i) =>
                cache.tryGet(i.plink, async () => {
                    const pInfo = await fetchContent(i.plink);
                    i.description = pInfo.content;
                    return i;
                })
            )
        );
    } else {
        resultItems = data.cards[0].card_group.map((item) => {
            const title = item.desc;
            const link = `https://m.weibo.cn/search?containerid=100103type%3D1%26q%3D${encodeURIComponent(item.desc)}`;
            const description = item.desc;
            return {
                title,
                description,
                link,
            };
        });
    }

    return {
        title: '微博热搜榜',
        link: 'https://s.weibo.com/top/summary?cate=realtimehot',
        description: '实时热点，每分钟更新一次',
        item: resultItems,
    };
}

async function fetchContent(url) {
    // Fetch the subpageinof
    const cookieString = config.weibo.cookies ?? '';
    const subres = await got(url, {
        headers: {
            Cookie: cookieString,
        },
    });
    let demostr = '';
    try {
        const rdata = subres.data;
        const cards = rdata.data.cards;
        // Need to find one cards with 'type ==9'
        demostr = seekContent(cards);
    } catch {
        // console.log(e);
        // console.log(url);
    }
    const ret = demostr;
    return {
        content: ret,
    };
}

function seekContent(clist) {
    const $ = load('<div id="wbcontent"></div>');
    const stub = $('#wbcontent');

    const renderDigest = ({ author, msg, link, postinfo, pics }) =>
        renderToString(
            <>
                <div class="quoted">
                    <a style="text-decoration: none;" href={author.link}>
                        {author.name}
                    </a>
                    <span>
                        <a href={link}>{` | ${postinfo} `}</a>
                    </span>
                </div>
                <div class="content">{msg ? raw(msg) : null}</div>
                {pics.length ? (
                    <>
                        <br />
                        <div class="pic-row">
                            {pics.map((pic) => (
                                <a href={pic.rurl}>
                                    <img src={pic.url} />
                                </a>
                            ))}
                        </div>
                    </>
                ) : null}
                <hr />
            </>
        );

    // To for..of per reviewers comment
    // Need to find one clist with 'type ==9'
    for (const curitem of clist) {
        if (curitem.card_type === 9) {
            const tbpic = curitem.mblog.thumbnail_pic ?? '';
            const index = tbpic.lastIndexOf('/');
            const thumbfolder = tbpic.slice(0, index + 1);

            const curcontent = load(curitem.mblog.text);
            if (wpic === 'true') {
                curcontent('img').attr('width', '1em').attr('height', '1em');
            } else {
                curcontent('img').remove();
            }
            const section = renderDigest({
                author: {
                    link: curitem.mblog.user.profile_url,
                    name: curitem.mblog.user.screen_name,
                },
                msg: curcontent.html(),
                link: curitem.scheme,
                postinfo: curitem.mblog.created_at,
                pics:
                    wpic === 'true' && curitem.mblog.pic_num > 0
                        ? curitem.mblog.pics.map((item) => {
                              // Get thumbnail_pic instead of orginal ones
                              const pid = item.pid;
                              return fullpic === 'false' ? { url: thumbfolder + pid + '.jpg', rurl: item.url } : { url: item.url, rurl: item.url };
                          })
                        : [],
            });
            stub.append(section);
        }
        if (curitem.card_type === 11) {
            stub.append(seekContent(curitem.card_group));
        }
    }
    return stub.html();
}
