// Someone's profile: who they are, whether you follow each other, the projects you share and what
// they did in them lately, with Follow and Message buttons.

import { useEffect, useState } from 'preact/hooks'
import { call } from '../bridge'
import * as F from '../format'
import { currentLang } from '../i18n'
import { Icon } from '../icons'
import { closeAllOverlays, pop as popNav, push } from '../nav'
import { ago } from '../net'
import { getState, useApp } from '../store'
import { Avatar, Btn, Card, PageHeader, Round, toast } from '../ui'
import { activityText } from './activity'
import { canMessage, chatWith, FollowButton, useFollows } from './chat'

interface Person {
  id: string; username: string; name: string; bio: string; github: string; avatarRev: number
  joinedAt: number; followers: number; following: number; youFollow: boolean; followsYou: boolean; projects: string[]
}

/** Opens a person's profile (yours opens your own Profile page). */
export function openPerson(p: { id: string } | string) {
  const id = typeof p === 'string' ? p : p.id
  if (!id) return
  closeAllOverlays()
  setTimeout(() => push(id === getState().user?.id ? { name: 'profile' } : { name: 'person', id }), 60)
}

/** What the app already knows about someone, to show while their profile loads. */
function known(id: string) {
  const s = getState()
  return s.spaces.flatMap(sp => [...sp.members, ...sp.pending]).find(m => m.id === id)
}

const cache = new Map<string, Person>()

export function PersonScreen({ id }: { id: string }) {
  const s = useApp()
  const f = useFollows()
  const [p, setP] = useState<Person | null>(cache.get(id) ?? null)
  const [error, setError] = useState('')
  useEffect(() => {
    call<Person>('api.request', { path: '/api/person', body: { userId: id } })
      .then(r => { if (r?.id) { cache.set(id, r); setP(r) } })
      .catch(e => setError(String((e as Error)?.message ?? e)))
  }, [id])

  const base = p ?? known(id) ?? f.following.find(x => x.id === id) ?? f.followers.find(x => x.id === id)
  const name = base?.name || (base?.username ? '@' + base.username : '')
  const username = base?.username ?? ''
  const person = { id, name: base?.name ?? '', username, avatarRev: base?.avatarRev ?? 0 }
  // Follow counts from the server, adjusted right away when you follow or unfollow here.
  const youFollow = f.loaded ? f.following.some(x => x.id === id) : !!p?.youFollow
  const followsYou = f.loaded ? f.followers.some(x => x.id === id) : !!p?.followsYou
  const followers = p ? p.followers + Number(youFollow) - Number(p.youFollow) : null
  const shared = (p?.projects ?? s.spaces.filter(sp => sp.members.some(m => m.id === id)).map(sp => sp.projectId))
    .map(pid => s.data.project.find(x => x.id === pid)).filter(Boolean) as typeof s.data.project
  const recent = s.data.activity.filter(a => a.userId === id).sort((a, b) => b.at - a.at).slice(0, 6)
  const mayMessage = canMessage(id, f) || shared.length > 0

  return (
    <div class="scroll">
      <PageHeader title={name || 'Profile'} onBack={popNav}>
        {username && <Round icon="share" label="Share profile" onClick={() => call('app.share', { subject: 'Carrot Note', text: `${name} is @${username} on Carrot Note.\n\nGet the app: https://github.com/DG-925/carrot-note/releases/latest` })} />}
      </PageHeader>
      <div class="content no-tabbar">
        <div class="card pop person-card" style={{ '--i': 1 } as any}>
          <div class="cover" />
          <div class="person-avatar"><Avatar userId={id} rev={person.avatarRev} name={name || '?'} size={104} class="ring-card" /></div>
          <div class="person-body">
            <div class="h-xl" dir="auto">{name || '…'}</div>
            {username && <div class="accent semibold">@{username}</div>}
            {followsYou && <span class="meta" style={{ marginTop: 8 }}><Icon name="users" size={11} />{youFollow ? 'You follow each other' : 'Follows you'}</span>}
            {p?.bio && <p class="person-bio" dir="auto">{p.bio}</p>}
            <div class="person-stats">
              <div><b class="num">{followers ?? '–'}</b><span>Followers</span></div>
              <div><b class="num">{p?.following ?? '–'}</b><span>{currentLang() === 'ar' ? 'يتابع' : 'Following'}</span></div>
              <div><b class="num">{shared.length}</b><span>Shared projects</span></div>
            </div>
            <div class="row" style={{ marginTop: 14 }}>
              {username && <div class="grow person-follow"><FollowButton p={person} f={f} /></div>}
              <Btn class="grow" kind="soft-bg" icon="chat"
                onClick={() => (mayMessage ? chatWith(person) : toast(`Follow @${username} first to message them`))}>Message</Btn>
            </div>
          </div>
        </div>

        {error && !p && <Card><div class="row"><Icon name="warning" size={16} class="warn" /><span class="small grow">{error}</span></div></Card>}

        {p?.github && <button class="item card press pop person-link" style={{ '--i': 2 } as any} onClick={() => call('app.openUrl', { url: `https://github.com/${p.github}` })}>
          <span class="badge-ico t-lilac"><Icon name="github" size={17} /></span>
          <div class="main"><div class="t">GitHub</div><div class="s">github.com/{p.github}</div></div>
          <Icon name="open" size={14} class="muted" />
        </button>}

        {shared.length > 0 && <>
          <div class="section-h"><h3>Projects you share</h3></div>
          <div class="card flush pop person-list wide" style={{ '--i': 3 } as any}>
            {shared.map(pr => (
              <button key={pr.id} class="item press" onClick={() => push({ name: 'project', id: pr.id })}>
                <span class="badge-ico t-sky"><Icon name="project" size={16} /></span>
                <div class="main"><div class="t">{pr.name}</div><div class="s">{pr.clientName || 'Shared project'}</div></div>
                <Icon name="right" size={13} class="muted" />
              </button>
            ))}
          </div>
        </>}

        {recent.length > 0 && <>
          <div class="section-h"><h3>Lately</h3></div>
          <div class="card flush pop person-list wide" style={{ '--i': 4 } as any}>
            {recent.map(a => (
              <button key={a.id} class="item press" onClick={() => push({ name: 'project', id: a.projectId })}>
                <div class="main">
                  <div class="t" style={{ whiteSpace: 'normal' }}>{activityText(a)}</div>
                  <div class="s">{[s.data.project.find(x => x.id === a.projectId)?.name, ago(new Date(a.at).toISOString())].filter(Boolean).join(' · ')}</div>
                </div>
              </button>
            ))}
          </div>
        </>}

        {p?.joinedAt ? <div class="tiny muted" style={{ textAlign: 'center', marginTop: 4 }}>{`On Carrot Note since ${F.month(F.dayOfMs(p.joinedAt))}`}</div> : null}
      </div>
    </div>
  )
}
