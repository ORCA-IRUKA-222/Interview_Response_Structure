import { useAppState } from '../lib/store';
import { SyncChip } from './common';
import { InterviewList, QuestionTree } from './Columns';
import { QuestionDetail } from './QuestionDetail';
import { Study } from './Study';
import { Karaoke } from './Karaoke';
import { Search } from './Search';
import { Settings } from './Settings';
import { paths, useRoute } from './router';

function TopBar() {
  return (
    <header class="topbar">
      <a class="brand" href={paths.home}>
        <span class="brand-mark" aria-hidden="true">Q</span>
        <span class="brand-name">面接ノート</span>
      </a>
      <nav class="topnav" aria-label="主要メニュー">
        <a class="btn" href={paths.search()}>
          検索
        </a>
        <a class="btn" href={paths.study()}>
          単語帳
        </a>
        <a class="btn" href={paths.settings}>
          設定
        </a>
      </nav>
      <SyncChip />
    </header>
  );
}

export function App() {
  useAppState();
  const route = useRoute();

  let body;
  switch (route.name) {
    case 'study':
      body = <Study key={`${route.iid}|${route.tag}`} iid={route.iid} tag={route.tag} />;
      break;
    case 'karaoke':
      body = <Karaoke key={route.qid} qid={route.qid} />;
      break;
    case 'search':
      body = <Search q={route.q} tag={route.tag} />;
      break;
    case 'settings':
      body = <Settings />;
      break;
    default: {
      const iid = route.name === 'interview' || route.name === 'question' ? route.iid : undefined;
      const qid = route.name === 'question' ? route.qid : undefined;
      const depth = qid ? 2 : iid ? 1 : 0;
      body = (
        <div class="columns" data-depth={depth}>
          <InterviewList selected={iid} />
          {iid ? (
            <QuestionTree key={iid} iid={iid} selected={qid} />
          ) : (
            <section class="col col-tree placeholder">
              <div class="empty">左の一覧から面接を選んでください</div>
            </section>
          )}
          {iid && qid ? (
            <QuestionDetail key={qid} iid={iid} qid={qid} />
          ) : (
            <section class="col col-detail placeholder">
              <div class="empty">{iid ? '質問を選ぶか、新しく追加してください' : ''}</div>
            </section>
          )}
        </div>
      );
    }
  }

  return (
    <div class="shell">
      <TopBar />
      {body}
    </div>
  );
}
