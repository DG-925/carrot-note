// Repositories from the user's linked GitHub account (public GitHub API, no sign-in needed).

import { getJson } from './net'

export interface GhRepo {
  name: string; full_name: string; html_url: string; description: string | null; language: string | null
  stargazers_count: number; forks_count: number; open_issues_count: number; pushed_at: string; fork: boolean
  owner: { login: string }
}

/** "owner/name" from a GitHub link like github.com/owner/name or https://github.com/owner/name.git. */
export function repoPath(link: string): string | null {
  const t = link.trim().replace(/^https?:\/\//i, '').replace(/^(www\.|git@)/i, '')
  const m = /^(?:github\.com[/:])?([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100})(?:[/?#].*)?$/i.exec(t)
  return m ? `${m[1]}/${m[2].replace(/\.git$/i, '')}` : null
}

export const repoUrl = (path: string) => `https://github.com/${path}`

/** Repos the user owns or is a member of, most recently worked on first. */
export const myRepos = (login: string) =>
  getJson<GhRepo[]>(`https://api.github.com/users/${encodeURIComponent(login)}/repos?per_page=100&sort=pushed&type=all`, `gh.repos.${login.toLowerCase()}`, 10 * 60_000)

export const repoInfo = (path: string) =>
  getJson<GhRepo>(`https://api.github.com/repos/${path}`, `gh.repo.${path.toLowerCase()}`, 30 * 60_000)

/**
 * Checks that [path] is a real repository the user works on: one of theirs, or one they
 * have contributed to. Returns the repository, or throws with the reason.
 */
export async function verifyRepo(path: string, login: string): Promise<GhRepo> {
  let repo: GhRepo
  try { repo = await repoInfo(path) } catch (e) {
    throw new Error((e as Error).message === 'Not found' ? "That repository doesn't exist or is private." : (e as Error).message)
  }
  const me = login.toLowerCase()
  if (repo.owner.login.toLowerCase() === me) return repo
  const mine = await myRepos(login).catch(() => [] as GhRepo[])
  if (mine.some(r => r.full_name.toLowerCase() === repo.full_name.toLowerCase())) return repo
  const people = await getJson<{ login: string }[]>(`https://api.github.com/repos/${repo.full_name}/contributors?per_page=100`, `gh.contrib.${repo.full_name.toLowerCase()}`, 30 * 60_000).catch(() => [])
  if (Array.isArray(people) && people.some(p => p.login.toLowerCase() === me)) return repo
  throw new Error(`@${login} doesn't own or contribute to ${repo.full_name}. Only repositories you work on can be added.`)
}

export const languageColor = (lang: string | null) =>
  ({ Kotlin: '#A97BFF', Java: '#B07219', TypeScript: '#3178C6', JavaScript: '#F1E05A', Python: '#3572A5', Dart: '#00B4AB', Swift: '#F05138',
    'C#': '#178600', 'C++': '#F34B7D', Go: '#00ADD8', Rust: '#DEA584', PHP: '#4F5D95', Ruby: '#701516', HTML: '#E34C26', CSS: '#563D7C', Vue: '#41B883' } as Record<string, string>)[lang ?? ''] ?? '#8A817A'
