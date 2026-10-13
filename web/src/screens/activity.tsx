// Activity in shared projects: who added, changed, finished or deleted what. Lines are written by the
// store whenever someone changes a shared project's records, and they sync to the whole team.

import { Fragment } from 'preact'
import * as F from '../format'
import { Icon } from '../icons'
import { pop as popNav, push } from '../nav'
import { ago } from '../net'
import { useApp } from '../store'
import type { Activity } from '../types'
import { Avatar, Card, Empty, Hint, PageHeader } from '../ui'

const typeWord: Record<string, string> = {
  project: 'the project', task: 'task', note: 'note', event: 'event', rental: 'renter', invoice: 'invoice', quote: 'quote', doc: 'file',
}
const actionWord: Record<string, string> = {
  created: 'added', updated: 'changed', deleted: 'deleted', completed: 'finished', paid: 'recorded a payment on', split: 'split earnings in',
}
const actionIcon: Record<string, string> = { created: 'plus', updated: 'edit', deleted: 'trash', completed: 'checkCircle', paid: 'income', split: 'coins' }

export function activityText(a: Activity): string {
  const verb = actionWord[a.action] ?? a.action
  if (a.type === 'project') return a.action === 'split' ? `${verb} the project` : `${verb} the project${a.title ? ` “${a.title}”` : ''}`
  return `${verb} ${typeWord[a.type] ?? a.type}${a.title ? ` “${a.title}”` : ''}`
}

function Line({ a, showProject }: { a: Activity; showProject?: boolean }) {
  const s = useApp()
  const me = s.user?.id === a.userId
  const project = showProject ? s.data.project.find(p => p.id === a.projectId) : undefined
  const member = s.spaces.flatMap(sp => sp.members).find(m => m.id === a.userId)
  return (
    <div class="item" onClick={() => push({ name: 'project', id: a.projectId })}>
      <div style={{ position: 'relative' }}>
        <Avatar userId={a.userId} rev={member?.avatarRev ?? 0} name={a.name} size={36} />
        <span class="act-badge"><Icon name={actionIcon[a.action] ?? 'edit'} size={10} stroke={2.6} /></span>
      </div>
      <div class="main">
        <div class="t" style={{ whiteSpace: 'normal' }}><b>{me ? 'You' : a.name}</b> {activityText(a)}</div>
        <div class="s">{[project?.name, ago(new Date(a.at).toISOString())].filter(Boolean).join(' · ')}</div>
      </div>
    </div>
  )
}

/** The latest lines of one project, for its page. */
export function ProjectActivity({ projectId, limit = 4 }: { projectId: string; limit?: number }) {
  const s = useApp()
  const list = s.data.activity.filter(a => a.projectId === projectId).sort((a, b) => b.at - a.at)
  if (!list.length) return null
  return (
    <Card class="wide flush-card">
      <div class="row" style={{ padding: '12px 14px 2px' }}>
        <Icon name="team" size={15} class="accent" /><b class="grow">Team activity</b>
        {list.length > limit && <button class="link" onClick={() => push({ name: 'activity', id: projectId })}>See all</button>}
      </div>
      {list.slice(0, limit).map(a => <Line key={a.id} a={a} />)}
    </Card>
  )
}

export function ActivityScreen({ id }: { id?: string }) {
  const s = useApp()
  const project = id ? s.data.project.find(p => p.id === id) : undefined
  const list = s.data.activity.filter(a => !id || a.projectId === id).sort((a, b) => b.at - a.at)
  // Group by day.
  const days = new Map<number, Activity[]>()
  for (const a of list) {
    const d = F.dayOfMs(a.at)
    days.set(d, [...(days.get(d) ?? []), a])
  }
  return (
    <div class="scroll">
      <PageHeader title={project ? `${project.name} · activity` : 'Team activity'} onBack={popNav} />
      <div class="content no-tabbar">
        {!list.length && <Empty icon="team" title="Nothing yet" text="When you or your teammates add or change things in a shared project, it shows here." />}
        {[...days.entries()].map(([d, items]) => (
          <Fragment key={d}>
            <div class="section-h"><h3>{F.relativeDay(d)}</h3></div>
            <div class="card flush">{items.map(a => <Line key={a.id} a={a} showProject={!id} />)}</div>
          </Fragment>
        ))}
        {list.length > 0 && <Hint>Only shared projects have activity. The newest 150 lines of each project are kept.</Hint>}
      </div>
    </div>
  )
}
