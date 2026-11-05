#!/usr/bin/env node
/**
 * FacilityPPM tenant-isolation audit — heuristic and report-only (never modifies files).
 *
 * Checks:
 *   1. API route handlers (app/api/**\/route.ts) and server actions ('use server') for authentication,
 *      authorization (provider / role / helper) and property scoping before service-client use;
 *      public [token] routes for expiry, single-use and hashing.
 *   2. Source files for client/server boundary leaks and user_metadata reads.
 *   3. supabase/migrations/*.sql — effective RLS state (tables without RLS, permissive policies,
 *      deprecated auth.role(), token-presence policies, unscoped storage policies, SECURITY DEFINER, views).
 *
 * Usage (from repo root):
 *   node .github/skills/facilityppm-tenant-isolation/scripts/audit-tenant-isolation.mjs [--root <dir>] [--json] [--all] [--strict]
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const HELP = `FacilityPPM tenant-isolation audit (heuristic, report-only)

Options:
  --root <dir>  Repository root (default: current directory)
  --json        Emit JSON instead of Markdown
  --all         Also list handlers with no findings
  --strict      Exit with code 1 when any HIGH finding exists
  -h, --help    Show this help

Suppress a reviewed false positive with a comment containing "audit-allow: <reason>" inside the
handler, or "audit-allow-file: <reason>" anywhere in the file.`

const opts = parseArgs(process.argv.slice(2))
const ROOT = opts.root

let ts
try {
  ts = createRequire(path.join(ROOT, 'package.json'))('typescript')
} catch {
  console.error(`Cannot load "typescript" from ${ROOT}/node_modules. Run "pnpm install" first.`)
  process.exit(2)
}

const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const SEVERITY_ORDER = { HIGH: 0, MEDIUM: 1, LOW: 2, INFO: 3 }
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'out', 'dist', '.vercel'])

/** Project guards with known security semantics (lib/authz/guard.ts and wrappers around it). */
const KNOWN_HELPERS = {
  requireSession: { authn: true, service: true },
  authorize: { authz: true },
  requireProvider: { authn: true, authz: true, service: true },
  authorizeTenantSubmit: { authz: true },
  requireMondayPropertyAdmin: { authn: true, authz: true, service: true },
}

const RX = {
  authn: /\.auth\.getUser\s*\(/,
  service: /\bcreateServiceClient\s*\(/,
  provider: /app_metadata\s*\??\.\s*role\s*[!=]==?\s*['"]provider['"]/g,
  role: new RegExp(
    [
      String.raw`\b(?:role|roleName|actorRole)\s*[!=]==?\s*['"]`,
      String.raw`['"][\w ]+['"]\s*[!=]==?\s*(?:[\w?]+\.)*(?:role|roleName)\b`,
      String.raw`\.(?:includes|has)\(\s*(?:[\w?]+\.)*(?:role|roleName)\s*\)`,
      String.raw`normalizeRoleName\([^)]*\)\s*[!=]==`,
    ].join('|')
  ),
  propertyScope: /app_metadata\s*\??\.\s*property_(?:id|ids|slug|slugs)\b/,
  bodyPropertyId: /\b(?:body|payload|input|data)\s*\??\.\s*(?:property_id|propertyId|property_slug)\b|searchParams\.get\(\s*['"](?:property_?[iI]d|slug)['"]/,
  tokenLookup: /\.eq\(\s*['"]\w*token\w*['"]/,
  tokenExpiry: /expires_at|expiresAt/,
  tokenSingleUse: /used_at|signed_at|approved_at|already/i,
  tokenHashed: /createHash|sha256|token_hash|hashToken/i,
  allow: /audit-allow:\s*\S/,
  allowFile: /audit-allow-file:\s*\S/,
  userMetadataRead: /\buser_metadata\s*(?:\?\.|\.)\s*(?!(?:full_name|name|display_name|avatar_url|picture|phone)\b)\w+|\buser_metadata\s*(?:\?\.)?\[/,
  getSession: /\.auth\.getSession\s*\(/,
  publicSecretEnv: /NEXT_PUBLIC_\w*(?:SERVICE_ROLE|SECRET|PRIVATE)\w*/,
  serviceKey: /SUPABASE_SERVICE_ROLE_KEY/,
  useClient: /^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*['"]use client['"]/,
  useServer: /^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*['"]use server['"]/,
  serverImport: /from\s+['"]@\/lib\/supabase\/server['"]|\bcreateServiceClient\b/,
}

const findings = []
const inventory = []

function addFinding(f) {
  findings.push(f)
}

// ───────────────────────── helpers ─────────────────────────

function parseArgs(argv) {
  const o = { root: process.cwd(), json: false, all: false, strict: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--json') o.json = true
    else if (a === '--all') o.all = true
    else if (a === '--strict') o.strict = true
    else if (a === '--root') {
      if (!argv[i + 1]) fail('--root requires a directory')
      o.root = argv[++i]
    } else if (a === '-h' || a === '--help') {
      console.log(HELP)
      process.exit(0)
    } else fail(`Unknown argument: ${a}`)
  }
  o.root = path.resolve(o.root)
  if (!fs.existsSync(path.join(o.root, 'package.json'))) fail(`No package.json in ${o.root}`)
  return o
}

function fail(msg) {
  console.error(`${msg}\n\n${HELP}`)
  process.exit(2)
}

function walk(dir, predicate, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, predicate, out)
    else if (predicate(full)) out.push(full)
  }
  return out
}

const rel = (abs) => path.relative(ROOT, abs).split(path.sep).join('/')
const lineOf = (text, index) => text.slice(0, index).split('\n').length

// ───────────────────────── 1. route handlers & server actions ─────────────────────────

function routeLabel(relPath) {
  return '/' + relPath.replace(/^app\//, '').replace(/\/route\.(t|j)sx?$/, '')
}

function analyzeEntryFile(abs, kind) {
  const text = fs.readFileSync(abs, 'utf8')
  const relPath = rel(abs)
  const isTsx = /\.(t|j)sx$/.test(abs)
  const sf = ts.createSourceFile(abs, text, ts.ScriptTarget.Latest, true, isTsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const fileAllowed = RX.allowFile.test(text)

  const locals = new Map()
  const handlers = []
  const isExported = (node) => (ts.getModifiers?.(node) ?? node.modifiers ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
  const isHandlerName = (name) => (kind === 'action' ? true : HTTP_METHODS.has(name))

  for (const stmt of sf.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name) {
      locals.set(stmt.name.text, stmt)
      if (isExported(stmt) && isHandlerName(stmt.name.text)) handlers.push({ name: stmt.name.text, node: stmt })
    } else if (ts.isVariableStatement(stmt)) {
      for (const d of stmt.declarationList.declarations) {
        const init = d.initializer
        if (ts.isIdentifier(d.name) && init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
          locals.set(d.name.text, init)
          if (isExported(stmt) && isHandlerName(d.name.text)) handlers.push({ name: d.name.text, node: init })
        }
      }
    }
  }

  const calledNames = (node) => {
    const names = new Set()
    const visit = (n) => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) names.add(n.expression.text)
      ts.forEachChild(n, visit)
    }
    visit(node)
    return names
  }

  // Handler text plus every same-file function it (transitively) calls
  const closure = (node) => {
    const texts = [node.getText(sf)]
    const calls = new Set()
    const seen = new Set([node])
    const queue = [node]
    while (queue.length) {
      for (const name of calledNames(queue.pop())) {
        calls.add(name)
        const local = locals.get(name)
        if (local && !seen.has(local)) {
          seen.add(local)
          texts.push(local.getText(sf))
          queue.push(local)
        }
      }
    }
    return { text: texts.join('\n'), calls }
  }

  const label = kind === 'route' ? routeLabel(relPath) : relPath
  const isTokenRoute = kind === 'route' && /\[token\]/.test(relPath)

  for (const h of handlers) {
    const { text: body, calls } = closure(h.node)
    const helpers = [...calls].filter((c) => KNOWN_HELPERS[c])
    const helperHas = (k) => helpers.some((c) => KNOWN_HELPERS[c][k])
    const s = {
      authn: RX.authn.test(body) || helperHas('authn'),
      service: RX.service.test(body) || helperHas('service'),
      provider: new RegExp(RX.provider.source).test(body),
      role: RX.role.test(body.replace(RX.provider, '')),
      helper: helperHas('authz'),
      propertyScope: RX.propertyScope.test(body),
      bodyPropertyId: RX.bodyPropertyId.test(body),
    }
    const line = sf.getLineAndCharacterOfPosition(h.node.getStart(sf)).line + 1
    const loc = `${relPath}:${line}`
    const signals = Object.entries(s).filter(([, v]) => v).map(([k]) => k)
    if (helpers.length) signals.push(`helpers=${helpers.join('+')}`)
    const entry = { kind, route: label, method: h.name, location: loc, signals, status: 'OK' }
    inventory.push(entry)

    const report = (severity, message) => {
      entry.status = severity
      addFinding({ area: kind === 'route' ? 'api' : 'server-action', severity, route: label, method: h.name, location: loc, message, signals })
    }

    if (fileAllowed || RX.allow.test(body)) {
      entry.status = 'ALLOWED'
      continue
    }

    if (isTokenRoute) {
      const missing = []
      if (!RX.tokenLookup.test(body)) missing.push('token lookup')
      if (!RX.tokenExpiry.test(body)) missing.push('expiry check')
      if (!RX.tokenSingleUse.test(body)) missing.push('single-use check')
      if (missing.length) report('MEDIUM', `Public token route missing: ${missing.join(', ')}.`)
      else if (!RX.tokenHashed.test(body)) report('LOW', 'Public token route compares the raw token; store and compare a SHA-256 hash, and make single-use atomic.')
      continue
    }

    const authorized = s.helper || s.provider || s.role
    if (!s.authn) {
      report(s.service ? 'HIGH' : 'MEDIUM', s.service
        ? 'No auth.getUser(): unauthenticated callers reach a handler that uses the service client (bypasses RLS).'
        : 'No auth.getUser(): handler is publicly reachable. Confirm this is intended and add "audit-allow: <reason>".')
    } else if (!authorized) {
      if (!s.service) {
        report('LOW', 'Authenticated but no app-layer authorization; relies entirely on RLS. Confirm the policies are role/tenant aware.')
      } else if (s.propertyScope) {
        report(MUTATING.has(h.name) ? 'MEDIUM' : 'LOW',
          'Property-scoped via app_metadata but no role check: any member of the property (including tenants) can call this. Check the role matrix.')
      } else {
        report('HIGH', 'Authenticated only: service client (bypasses RLS) with no property, role or provider check.')
      }
    } else if (s.bodyPropertyId && !s.propertyScope && !s.helper && !s.provider) {
      report('MEDIUM', 'Reads a property id/slug from the request without checking it against app_metadata.property_ids.')
    }
  }
}

const routeFiles = walk(path.join(ROOT, 'app', 'api'), (f) => /[\\/]route\.(t|j)sx?$/.test(f))
for (const f of routeFiles) analyzeEntryFile(f, 'route')

const sourceFiles = [
  ...walk(path.join(ROOT, 'app'), (f) => /\.(t|j)sx?$|\.mjs$/.test(f)),
  ...walk(path.join(ROOT, 'components'), (f) => /\.(t|j)sx?$/.test(f)),
  ...walk(path.join(ROOT, 'lib'), (f) => /\.(t|j)sx?$/.test(f)),
  ...['middleware.ts', 'next.config.mjs'].map((f) => path.join(ROOT, f)).filter((f) => fs.existsSync(f)),
]

const actionFiles = sourceFiles.filter((f) => RX.useServer.test(fs.readFileSync(f, 'utf8')))
for (const f of actionFiles) analyzeEntryFile(f, 'action')

// ───────────────────────── 2. source boundary checks ─────────────────────────

for (const f of sourceFiles) {
  const text = fs.readFileSync(f, 'utf8')
  const relPath = rel(f)
  if (RX.allowFile.test(text)) continue
  const isClient = RX.useClient.test(text)
  const at = (rx) => {
    const m = rx.exec(text)
    return m ? `${relPath}:${lineOf(text, m.index)}` : relPath
  }

  if (isClient && RX.serverImport.test(text)) {
    addFinding({ area: 'source', severity: 'HIGH', location: at(RX.serverImport), message: "'use client' file imports the server Supabase module / service client." })
  }
  if (RX.publicSecretEnv.test(text)) {
    addFinding({ area: 'source', severity: 'HIGH', location: at(RX.publicSecretEnv), message: 'Secret-looking NEXT_PUBLIC_* variable — NEXT_PUBLIC_ values are shipped to the browser.' })
  }
  if (RX.serviceKey.test(text) && relPath !== 'lib/supabase/server.ts') {
    addFinding({ area: 'source', severity: isClient ? 'HIGH' : 'MEDIUM', location: at(RX.serviceKey), message: 'SUPABASE_SERVICE_ROLE_KEY referenced outside lib/supabase/server.ts; use createServiceClient().' })
  }
  if (RX.userMetadataRead.test(text)) {
    addFinding({ area: 'source', severity: 'MEDIUM', location: at(RX.userMetadataRead), message: 'Reads user_metadata (user-editable). Verify it is display-only and never used for authorization.' })
  }
  if (!isClient && RX.getSession.test(text)) {
    addFinding({ area: 'source', severity: 'LOW', location: at(RX.getSession), message: 'Server code calls auth.getSession(); use auth.getUser() for authorization decisions.' })
  }
}

// ───────────────────────── 3. migrations / RLS ─────────────────────────

function splitSql(src, baseLine = 1) {
  const stmts = []
  let buf = ''
  let line = baseLine
  let start = null
  let i = 0
  const take = (s) => {
    if (start === null) start = line
    buf += s
    line += (s.match(/\n/g) || []).length
  }
  while (i < src.length) {
    const ch = src[i]
    const next = src[i + 1]
    if (ch === '-' && next === '-') {
      const end = src.indexOf('\n', i)
      i = end === -1 ? src.length : end
      continue
    }
    if (ch === '/' && next === '*') {
      const end = src.indexOf('*/', i + 2)
      const stop = end === -1 ? src.length : end + 2
      line += (src.slice(i, stop).match(/\n/g) || []).length
      buf += ' '
      i = stop
      continue
    }
    if (ch === "'" || ch === '"') {
      let j = i + 1
      while (j < src.length) {
        if (src[j] === ch) {
          if (src[j + 1] === ch) { j += 2; continue }
          break
        }
        j++
      }
      take(src.slice(i, j + 1))
      i = j + 1
      continue
    }
    if (ch === '$') {
      const m = /^\$([A-Za-z_]\w*)?\$/.exec(src.slice(i, i + 64))
      if (m) {
        const end = src.indexOf(m[0], i + m[0].length)
        const stop = end === -1 ? src.length : end + m[0].length
        take(src.slice(i, stop))
        i = stop
        continue
      }
    }
    if (ch === ';') {
      if (buf.trim()) stmts.push({ sql: buf.trim(), line: start ?? line })
      buf = ''
      start = null
      i++
      continue
    }
    if (ch === '\n') line++
    else if (start === null && !/\s/.test(ch)) start = line
    buf += ch
    i++
  }
  if (buf.trim()) stmts.push({ sql: buf.trim(), line: start ?? line })
  return stmts
}

/** Expands DO $$ … $$ blocks so statements inside them (e.g. conditional CREATE POLICY) are analysed. */
function expandStatements(stmts) {
  const out = []
  for (const st of stmts) {
    const m = /^do\s+(\$([A-Za-z_]\w*)?\$)([\s\S]*)\1/i.exec(st.sql)
    if (m) {
      const offset = st.sql.slice(0, m.index + m[0].indexOf(m[3])).split('\n').length - 1
      out.push(...expandStatements(splitSql(m[3], st.line + offset)))
    } else out.push(st)
  }
  return out
}

const ident = (raw) => {
  const parts = raw.split('.').map((p) => (p.startsWith('"') ? p.slice(1, -1).replace(/""/g, '"') : p.toLowerCase()))
  return parts.length === 1 ? parts[0] : parts[0] === 'public' ? parts[1] : parts.join('.')
}
const IDENT = String.raw`(?:"(?:[^"]|"")+"|[\w]+)(?:\.(?:"(?:[^"]|"")+"|[\w]+))?`
const SQL_STARTS = new RegExp(String.raw`\b(create\s+(?:unlogged\s+)?table|drop\s+table|alter\s+table|create\s+policy|drop\s+policy|create\s+(?:or\s+replace\s+)?function|drop\s+function|revoke|create\s+(?:or\s+replace\s+)?(?:materialized\s+)?view|drop\s+view|insert\s+into\s+storage\.buckets)\b`, 'i')

const tables = new Map() // name -> {location}
const rlsEnabled = new Set()
const policies = new Map() // table::name -> {table, name, sql, location}
const functions = new Map() // name -> {sql, location, schema}
const revokedFunctions = new Set()
const views = new Map()
const publicBuckets = new Map()

const migrationDir = path.join(ROOT, 'supabase', 'migrations')
const migrationFiles = fs.existsSync(migrationDir)
  ? fs.readdirSync(migrationDir).filter((f) => f.endsWith('.sql')).sort()
  : []

for (const file of migrationFiles) {
  const src = fs.readFileSync(path.join(migrationDir, file), 'utf8')
  for (const st of expandStatements(splitSql(src))) {
    const startMatch = SQL_STARTS.exec(st.sql)
    if (!startMatch) continue
    const sql = st.sql.slice(startMatch.index)
    const flat = sql.replace(/\s+/g, ' ')
    const location = `supabase/migrations/${file}:${st.line + (st.sql.slice(0, startMatch.index).match(/\n/g) || []).length}`
    let m

    if ((m = new RegExp(String.raw`^create (?:unlogged )?table (?:if not exists )?(${IDENT})`, 'i').exec(flat))) {
      const name = ident(m[1])
      if (!name.includes('.')) tables.set(name, { location })
    } else if ((m = new RegExp(String.raw`^drop table (?:if exists )?(${IDENT}(?:\s*,\s*${IDENT})*)`, 'i').exec(flat))) {
      for (const t of m[1].split(',')) {
        tables.delete(ident(t.trim()))
        rlsEnabled.delete(ident(t.trim()))
      }
    } else if ((m = new RegExp(String.raw`^alter table (?:if exists )?(?:only )?(${IDENT}) (enable|disable) row level security`, 'i').exec(flat))) {
      if (m[2].toLowerCase() === 'enable') rlsEnabled.add(ident(m[1]))
      else rlsEnabled.delete(ident(m[1]))
    } else if ((m = new RegExp(String.raw`^create policy (${IDENT}) on (${IDENT})`, 'i').exec(flat))) {
      const table = ident(m[2])
      policies.set(`${table}::${ident(m[1])}`, { table, name: ident(m[1]), sql: flat, location })
    } else if ((m = new RegExp(String.raw`^drop policy (?:if exists )?(${IDENT}) on (${IDENT})`, 'i').exec(flat))) {
      policies.delete(`${ident(m[2])}::${ident(m[1])}`)
    } else if ((m = new RegExp(String.raw`^create (?:or replace )?function (${IDENT})`, 'i').exec(flat))) {
      const name = ident(m[1])
      functions.set(name, { sql: flat, location, schema: name.includes('.') ? name.split('.')[0] : 'public' })
    } else if ((m = new RegExp(String.raw`^drop function (?:if exists )?(${IDENT})`, 'i').exec(flat))) {
      functions.delete(ident(m[1]))
    } else if ((m = new RegExp(String.raw`^revoke (?:all|execute)(?: privileges)? on function (${IDENT})`, 'i').exec(flat))) {
      revokedFunctions.add(ident(m[1]))
    } else if ((m = new RegExp(String.raw`^create (?:or replace )?(?:materialized )?view (?:if not exists )?(${IDENT})`, 'i').exec(flat))) {
      views.set(ident(m[1]), { sql: flat, location })
    } else if ((m = new RegExp(String.raw`^drop view (?:if exists )?(${IDENT})`, 'i').exec(flat))) {
      views.delete(ident(m[1]))
    } else if (/^insert into storage\.buckets/i.test(flat)) {
      const cols = /\(([^)]*)\)\s*values\s*\(([^)]*)\)/i.exec(flat)
      if (cols) {
        const names = cols[1].split(',').map((c) => c.trim().toLowerCase())
        const values = cols[2].split(',').map((v) => v.trim().replace(/^'|'$/g, ''))
        const id = values[names.indexOf('id')] ?? values[0]
        const isPublic = names.includes('public') && /^true$/i.test(values[names.indexOf('public')])
        const forcedPublic = /do update set public\s*=\s*true/i.test(flat)
        if (isPublic || forcedPublic) publicBuckets.set(id, { location })
        else publicBuckets.delete(id)
      }
    }
  }
}

for (const [name, t] of tables) {
  if (!rlsEnabled.has(name)) {
    addFinding({ area: 'rls', severity: 'HIGH', location: t.location, message: `Table "${name}" is created in an exposed schema without ENABLE ROW LEVEL SECURITY.` })
  }
}

for (const p of policies.values()) {
  const head = p.sql.split(/\busing\b|\bwith check\b/i)[0].replace(/"(?:[^"]|"")+"/g, '""').trim()
  const toMatch = /\bto ([\w ,]+?)\s*$/i.exec(head)
  const roles = toMatch ? toMatch[1].split(',').map((r) => r.trim().toLowerCase()) : ['public']
  if (roles.every((r) => r === 'service_role')) continue
  const command = (/\bfor (select|insert|update|delete|all)\b/i.exec(head)?.[1] ?? 'all').toUpperCase()
  const verb = { SELECT: 'read/list', INSERT: 'insert/upload', UPDATE: 'modify', DELETE: 'delete', ALL: 'read and write' }[command]
  const audience = roles.includes('public') || roles.includes('anon')
    ? 'anyone holding the anon key (no TO clause / TO public / anon)'
    : `every ${roles.join(', ')} user in every property`
  const label = `Policy "${p.name}" (${command}) on ${p.table}`

  if (/\busing \( ?true ?\)|\bwith check \( ?true ?\)/i.test(p.sql)) {
    addFinding({ area: 'rls', severity: 'HIGH', location: p.location, message: `${label} is unconditional (true): ${audience} can ${verb} any row.` })
  }
  if (/\b\w*token\w* is not null\b/i.test(p.sql)) {
    addFinding({ area: 'rls', severity: 'HIGH', location: p.location, message: `${label} grants rows based on token *presence* (IS NOT NULL), not possession of the token.` })
  }
  if (/user_metadata/i.test(p.sql)) {
    addFinding({ area: 'rls', severity: 'HIGH', location: p.location, message: `${label} uses user_metadata, which users can edit.` })
  }
  if (/auth\.role\(\)/i.test(p.sql)) {
    addFinding({ area: 'rls', severity: 'MEDIUM', location: p.location, message: `${label} uses deprecated auth.role(); 'authenticated' alone is authentication without property/role authorization.` })
  }
  if (p.table === 'storage.objects' && !/auth\.(?:uid|jwt)\(|storage\.foldername|private\./i.test(p.sql)) {
    addFinding({ area: 'storage', severity: roles.includes('public') || roles.includes('anon') ? 'HIGH' : 'MEDIUM', location: p.location, message: `${label} is bucket-wide with no user/property path scoping: ${audience} can ${verb} files of every property in the bucket.` })
  }
}

for (const [id, b] of publicBuckets) {
  addFinding({ area: 'storage', severity: 'MEDIUM', location: b.location, message: `Storage bucket "${id}" is public: object URLs are readable without authentication. Prefer a private bucket + signed URLs for tenant documents.` })
}

for (const [name, fn] of functions) {
  if (!/\bsecurity definer\b/i.test(fn.sql)) continue
  if (!/\bset search_path\b/i.test(fn.sql)) {
    addFinding({ area: 'rls', severity: 'MEDIUM', location: fn.location, message: `SECURITY DEFINER function "${name}" has no SET search_path.` })
  }
  if (fn.schema === 'public' && !revokedFunctions.has(name)) {
    addFinding({ area: 'rls', severity: 'MEDIUM', location: fn.location, message: `SECURITY DEFINER function "${name}" is in the exposed public schema and EXECUTE is not revoked — callable via RPC by anon/authenticated.` })
  }
}

for (const [name, v] of views) {
  if (!/security_invoker\s*=\s*(?:true|on)/i.test(v.sql)) {
    addFinding({ area: 'rls', severity: 'MEDIUM', location: v.location, message: `View "${name}" lacks security_invoker = true and bypasses RLS of underlying tables.` })
  }
}

// ───────────────────────── output ─────────────────────────

findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.location.localeCompare(b.location, 'en', { numeric: true }))
const counts = { HIGH: 0, MEDIUM: 0, LOW: 0 }
for (const f of findings) counts[f.severity] = (counts[f.severity] ?? 0) + 1

const meta = {
  root: ROOT,
  routeFiles: routeFiles.length,
  handlers: inventory.filter((e) => e.kind === 'route').length,
  serverActionFiles: actionFiles.length,
  sourceFiles: sourceFiles.length,
  migrations: migrationFiles.length,
  tablesTracked: tables.size,
  effectivePolicies: policies.size,
}

if (opts.json) {
  console.log(JSON.stringify({ meta, counts, findings, inventory: opts.all ? inventory : undefined }, null, 2))
} else {
  const esc = (s) => String(s).replace(/\|/g, '\\|')
  const lines = []
  lines.push('# FacilityPPM tenant-isolation audit', '')
  lines.push(`Scanned ${meta.handlers} handlers in ${meta.routeFiles} route files, ${meta.serverActionFiles} server-action files, ${meta.sourceFiles} source files, ${meta.migrations} migrations (${meta.tablesTracked} tables, ${meta.effectivePolicies} effective policies).`, '')
  lines.push(`**HIGH ${counts.HIGH} · MEDIUM ${counts.MEDIUM} · LOW ${counts.LOW}** — heuristic results; triage each before acting.`, '')

  const sections = [
    ['API route handlers & server actions', (f) => f.area === 'api' || f.area === 'server-action', true],
    ['Database RLS (effective state declared in migrations)', (f) => f.area === 'rls', false],
    ['Storage', (f) => f.area === 'storage', false],
    ['Source boundary', (f) => f.area === 'source', false],
  ]
  for (const [title, pred, isApi] of sections) {
    const rows = findings.filter(pred)
    lines.push(`## ${title} (${rows.length})`, '')
    if (!rows.length) {
      lines.push('No findings.', '')
      continue
    }
    if (isApi) {
      lines.push('| Severity | Handler | Location | Finding | Signals |', '|---|---|---|---|---|')
      for (const f of rows) lines.push(`| ${f.severity} | \`${f.method} ${esc(f.route)}\` | ${esc(f.location)} | ${esc(f.message)} | ${esc(f.signals.join(', ') || '—')} |`)
    } else {
      lines.push('| Severity | Location | Finding |', '|---|---|---|')
      for (const f of rows) lines.push(`| ${f.severity} | ${esc(f.location)} | ${esc(f.message)} |`)
    }
    lines.push('')
  }

  if (opts.all) {
    lines.push('## Handler inventory', '', '| Status | Handler | Location | Signals |', '|---|---|---|---|')
    for (const e of inventory) lines.push(`| ${e.status} | \`${e.method} ${esc(e.route)}\` | ${esc(e.location)} | ${esc(e.signals.join(', ') || '—')} |`)
    lines.push('')
  }

  lines.push('Signals: authn = auth.getUser(); provider = app_metadata.role provider check; role = role comparison; helper = known authz helper; propertyScope = uses app_metadata.property_*; service = service client (bypasses RLS).')
  console.log(lines.join('\n'))
}

process.exit(opts.strict && counts.HIGH > 0 ? 1 : 0)
