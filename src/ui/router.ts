import { useEffect, useState } from 'preact/hooks';

export type Route =
  | { name: 'home' }
  | { name: 'interview'; iid: string }
  | { name: 'question'; iid: string; qid: string }
  | { name: 'study'; iid?: string; tag?: string }
  | { name: 'karaoke'; qid: string }
  | { name: 'search'; q: string; tag?: string }
  | { name: 'settings' };

export const paths = {
  home: '#/',
  interview: (iid: string) => `#/i/${iid}`,
  question: (iid: string, qid: string) => `#/i/${iid}/q/${qid}`,
  study: (opts: { iid?: string; tag?: string } = {}) => {
    const p = new URLSearchParams();
    if (opts.iid) p.set('i', opts.iid);
    if (opts.tag) p.set('tag', opts.tag);
    const s = p.toString();
    return `#/study${s ? `?${s}` : ''}`;
  },
  karaoke: (qid: string) => `#/karaoke/${qid}`,
  search: (q = '', tag?: string) => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (tag) p.set('tag', tag);
    const s = p.toString();
    return `#/search${s ? `?${s}` : ''}`;
  },
  settings: '#/settings',
};

export function parseRoute(hash: string): Route {
  const [pathPart, query = ''] = hash.replace(/^#/, '').split('?');
  const params = new URLSearchParams(query);
  const seg = pathPart.split('/').filter(Boolean);
  if (seg[0] === 'i' && seg[1]) {
    if (seg[2] === 'q' && seg[3]) return { name: 'question', iid: seg[1], qid: seg[3] };
    return { name: 'interview', iid: seg[1] };
  }
  if (seg[0] === 'study') return { name: 'study', iid: params.get('i') ?? undefined, tag: params.get('tag') ?? undefined };
  if (seg[0] === 'karaoke' && seg[1]) return { name: 'karaoke', qid: seg[1] };
  if (seg[0] === 'search') return { name: 'search', q: params.get('q') ?? '', tag: params.get('tag') ?? undefined };
  if (seg[0] === 'settings') return { name: 'settings' };
  return { name: 'home' };
}

export function go(path: string) {
  location.hash = path;
}

export function replace(path: string) {
  history.replaceState(null, '', path);
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
